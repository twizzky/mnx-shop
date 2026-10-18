// supabase/functions/admin-images/index.ts
//
// Server-side only. Deploy with: supabase functions deploy admin-images
// Configure the one secret it needs:
//   supabase secrets set ADMIN_PIN=choose-a-long-random-pin
//
// Why this exists instead of uploading straight from the browser:
//   1. ADMIN_PIN must stay secret. A VITE_* env var gets inlined into the
//      JavaScript bundle and is readable by anyone who views source, and
//      Supabase's anon key cannot be restricted to "people who know the
//      pin" — RLS sees the anon role, not the pin. Holding the pin here as
//      a Supabase secret (same pattern as create-shipment's ECOTRACK_TOKEN)
//      is the only way the products table and the storage bucket can stay
//      write-locked to the public.
//   2. Writing image_url/image_urls needs a service-role key, since
//      `products` is deliberately select-only under RLS (see
//      SUPABASE_SETUP.md §1) — customers can read the catalog but never
//      change it.
//
// This function is the ONLY thing allowed to write to `products` and to
// delete from the `product-images` bucket.
//
// Request: POST, multipart/form-data.
//   Authorization: Bearer <supabase anon key>  (the platform gateway
//     rejects anything that isn't a valid JWT before the function runs, so
//     the anon key goes here and the PIN travels in its own channel)
//   x-admin-pin: <pin>   (and/or a `pin` form field, as a fallback)
//   action=upload  files[]=<File>...        -> { success, urls[] }
//   action=save    productIds=[...] urls=[...] -> { success, updated }
//   action=delete  urls=[...]               -> { success, removed[] }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ADMIN_PIN = Deno.env.get('ADMIN_PIN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const BUCKET = 'product-images';
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 10;
const ACCEPTED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-pin',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/**
 * Length-safe, timing-safe-ish PIN comparison. A plain `===` would bail out
 * at the first differing character and leak the PIN length prefix through
 * response timing; comparing every byte keeps the work constant.
 */
function pinMatches(candidate: string, expected: string): boolean {
  const a = new TextEncoder().encode(candidate);
  const b = new TextEncoder().encode(expected);
  // Hash-free padding: always walk max length, XOR every byte.
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/** `/storage/v1/object/public/<bucket>/<path>` -> `<path>`, else null. */
function pathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const raw = url.slice(idx + marker.length);
  const path = decodeURIComponent(raw).replace(/^\/+/, '');
  // Only ever touch objects inside our own bucket's product folders.
  if (!path || !path.startsWith('products/')) return null;
  return path;
}

/**
 * Builds a collision-proof, traversal-safe storage key. The original
 * filename is only kept as a readable suffix — everything authority-bearing
 * comes from the timestamp + random segment, so a hostile filename can't
 * escape the product's folder or overwrite someone else's photo.
 */
function buildObjectPath(productId: string, file: File): string {
  const slug = productId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60) || 'product';
  const ext = (file.name.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1] || 'jpg').toLowerCase();
  const stamp = Date.now().toString(36);
  const rand = crypto.randomUUID().slice(0, 8);
  return `products/${slug}/${stamp}-${rand}.${ext}`;
}

/**
 * The bucket must exist and be public for `getPublicUrl` to resolve to
 * something a shopper's browser can load. Create it on first use so a
 * fresh project works without a manual dashboard step; the "already
 * exists" error on every later call is expected and ignored.
 */
async function ensureBucket(supabaseAdmin: ReturnType<typeof createClient>) {
  const { error } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_BYTES,
    allowedMimeTypes: [...ACCEPTED_MIME],
  });
  if (error && !/already exists/i.test(error.message)) {
    console.error('ensureBucket error:', error.message);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed.' }, 405);
  }

  if (!ADMIN_PIN) {
    return jsonResponse({ success: false, error: 'Admin PIN is not set on the server yet.' }, 500);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ success: false, error: 'Server credentials are missing.' }, 500);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid request body.' }, 400);
  }

  // The PIN travels in its own channel because the platform gateway
  // validates `Authorization` as a JWT and would reject a bare PIN before
  // this code ever ran. The header is the primary carrier; the form field
  // is a fallback in case a proxy strips custom headers.
  const presented = (req.headers.get('x-admin-pin') || String(form.get('pin') || '')).trim();
  if (!presented || !pinMatches(presented, ADMIN_PIN)) {
    // Same shape for "no pin" and "wrong pin" so the endpoint can't be
    // used to confirm whether a guessed pin is close.
    return jsonResponse({ success: false, error: 'Incorrect PIN.' }, 401);
  }

  const action = String(form.get('action') || '');
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // ---------- upload ----------
    if (action === 'upload') {
      const files = form.getAll('files').filter((f): f is File => f instanceof File);
      if (!files.length) {
        return jsonResponse({ success: false, error: 'No files were received.' }, 400);
      }
      if (files.length > MAX_FILES_PER_REQUEST) {
        return jsonResponse(
          { success: false, error: `Too many files — ${MAX_FILES_PER_REQUEST} at a time.` },
          400
        );
      }

      const oversize = files.find((f) => f.size > MAX_BYTES);
      if (oversize) {
        return jsonResponse(
          { success: false, error: `"${oversize.name}" is over the 5 MB limit.` },
          400
        );
      }
      const badType = files.find((f) => !ACCEPTED_MIME.has(f.type));
      if (badType) {
        return jsonResponse(
          { success: false, error: `"${badType.name}" is not a supported image format.` },
          400
        );
      }

      // The product id only namespaces the folder for humans; it is not
      // read back here, so uploads can't be redirected onto another row.
      const productId = String(form.get('productId') || 'product').slice(0, 60);
      await ensureBucket(supabaseAdmin);

      const urls: string[] = [];
      const skipped: string[] = [];
      for (const file of files) {
        const path = buildObjectPath(productId, file);
        const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, file, {
          contentType: file.type,
          cacheControl: '31536000',
          upsert: false,
        });
        if (error) {
          console.error('upload failed:', path, error.message);
          skipped.push(file.name);
          continue;
        }
        urls.push(supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
      }

      if (!urls.length) {
        return jsonResponse({ success: false, error: 'Every upload failed. Check the bucket.' }, 500);
      }
      return jsonResponse({ success: true, urls, skipped });
    }

    // ---------- save ----------
    if (action === 'save') {
      let productIds: string[];
      let urls: string[];
      try {
        productIds = JSON.parse(String(form.get('productIds') || '[]'));
        urls = JSON.parse(String(form.get('urls') || '[]'));
      } catch {
        return jsonResponse({ success: false, error: 'Malformed save payload.' }, 400);
      }
      if (!Array.isArray(productIds) || !productIds.length) {
        return jsonResponse({ success: false, error: 'No product selected.' }, 400);
      }

      // Dedupe, drop blanks, and refuse anything not hosted in our bucket —
      // an image the admin can't see the source of is a data-loss risk when
      // the next save rewrites the whole list.
      const clean = [...new Set(urls.filter((u) => typeof u === 'string' && u.trim()))].filter(
        (u) => !!pathFromPublicUrl(u)
      );

      const { error } = await supabaseAdmin
        .from('products')
        .update({
          // Store NULL rather than an empty array when every photo was
          // removed, so a cleared row is identical to one that never had
          // photos. `productImages` handles both, but the seed scripts and
          // Table Editor read more sensibly this way.
          image_urls: clean.length ? clean : null,
          image_url: clean[0] ?? null,
        })
        .in('id', productIds);

      if (error) {
        console.error('save failed:', error.message);
        return jsonResponse({ success: false, error: 'Could not save the photos.' }, 500);
      }
      return jsonResponse({ success: true, urls: clean, updated: productIds.length });
    }

    // ---------- delete ----------
    if (action === 'delete') {
      let urls: string[];
      try {
        urls = JSON.parse(String(form.get('urls') || '[]'));
      } catch {
        return jsonResponse({ success: false, error: 'Malformed delete payload.' }, 400);
      }

      // pathFromPublicUrl is the allow-list: anything not under
      // products/ in our own bucket is silently ignored rather than deleted.
      const paths = [
        ...new Set(urls.map((u) => (typeof u === 'string' ? pathFromPublicUrl(u) : null))),
      ].filter((p): p is string => !!p);
      if (!paths.length) {
        return jsonResponse({ success: true, removed: [] });
      }

      const { error } = await supabaseAdmin.storage.from(BUCKET).remove(paths);
      if (error) {
        console.error('delete failed:', error.message);
        return jsonResponse({ success: false, error: 'Could not delete the photos.' }, 500);
      }
      return jsonResponse({ success: true, removed: paths });
    }

    return jsonResponse({ success: false, error: 'Unknown action.' }, 400);
  } catch (err) {
    console.error('admin-images error:', err);
    return jsonResponse({ success: false, error: 'Unexpected server error.' }, 500);
  }
});