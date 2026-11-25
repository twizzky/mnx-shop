// supabase/functions/admin-images/index.ts
//
// Server-side only. Deploy with: supabase functions deploy admin-images
//
// Product photo management via Edge Function.
// Auth: session cookie (set by admin-auth) + CSRF token header.
// All writes use the service-role key; public RLS remains select-only.
//
// Request: POST, multipart/form-data.
//   Cookie: mnx_admin_session=<session_token>
//   X-CSRF-Token: <csrf_token>  (for state-changing actions)
//   action=upload  files[]=<File>...        -> { success, urls[] }
//   action=save    productIds=[...] urls=[...] -> { success, updated }
//   action=delete  urls=[...]               -> { success, removed[] }
//   action=recent                           -> { success, entries[] } (audit log)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BUCKET = "product-images";
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 10;
const ACCEPTED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

const SESSION_COOKIE_NAME = "mnx_admin_session";
const CSRF_COOKIE_NAME = "mnx_admin_csrf";
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_MAX_LIFETIME_MS = 8 * 60 * 60 * 1000;
const EXPECTED_ORIGIN = Deno.env.get("VITE_SITE_URL") || "https://mnx-shop.vercel.app";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": EXPECTED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-csrf-token",
  "Access-Control-Allow-Credentials": "true",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  extraHeaders: Record<string, string> = {}
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", ...extraHeaders },
  });
}

function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`;
}

function clearCsrfCookie(): string {
  return `${CSRF_COOKIE_NAME}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`;
}

function getSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(
    new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]+)`)
  );
  return match ? match[1] : null;
}

function getCsrfCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(
    new RegExp(`(?:^|; )${CSRF_COOKIE_NAME}=([^;]+)`)
  );
  return match ? match[1] : null;
}

function validateCsrf(
  cookieHeader: string | null,
  headerToken: string | null
): boolean {
  const cookieToken = getCsrfCookie(cookieHeader);
  if (!cookieToken || !headerToken) return false;
  if (cookieToken.length !== headerToken.length) return false;
  let diff = 0;
  for (let i = 0; i < cookieToken.length; i++) {
    diff |= cookieToken.charCodeAt(i) ^ headerToken.charCodeAt(i);
  }
  return diff === 0;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

async function hashToken(token: string): Promise<string> {
  // Use a simple hash for token lookup - we compare hashes stored in DB
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function validateSession(
  token: string
): Promise<{ userId: string; userEmail: string; totpEnabled: boolean } | null> {
  const tokenHash = await hashToken(token);
  const now = new Date().toISOString();

  const { data: session, error } = await supabaseAdmin
    .from("admin_sessions")
    .select("*, user_id (*)")
    .eq("token_hash", tokenHash)
    .gt("expires_at", now)
    .maybeSingle();

  if (error || !session) return null;

  // Check idle timeout
  const lastSeen = new Date(session.last_seen_at).getTime();
  const nowMs = Date.now();
  if (nowMs - lastSeen > SESSION_IDLE_TIMEOUT_MS) {
    await supabaseAdmin.from("admin_sessions").delete().eq("id", session.id);
    return null;
  }

  // Check max lifetime
  const createdAt = new Date(session.created_at).getTime();
  if (nowMs - createdAt > SESSION_MAX_LIFETIME_MS) {
    await supabaseAdmin.from("admin_sessions").delete().eq("id", session.id);
    return null;
  }

  // Update last_seen_at
  await supabaseAdmin
    .from("admin_sessions")
    .update({ last_seen_at: new Date(nowMs).toISOString() })
    .eq("id", session.id);

  const user = session.user_id;
  if (!user) return null;

  return {
    userId: user.id,
    userEmail: user.email,
    totpEnabled: user.totp_enabled,
  };
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const ip = getClientIp(req);
  const cookieHeader = req.headers.get("cookie") || "";
  const origin = req.headers.get("origin") || "";

  // CSRF protection for POST
  if (req.method === "POST") {
    if (origin !== EXPECTED_ORIGIN) {
      return jsonResponse({ success: false, error: "Invalid origin" }, 403);
    }
    const csrfHeader = req.headers.get("x-csrf-token");
    if (!validateCsrf(cookieHeader, csrfHeader)) {
      return jsonResponse({ success: false, error: "Invalid CSRF token" }, 403);
    }
  }

  // Validate session
  const token = getSessionCookie(cookieHeader);
  if (!token) {
    return jsonResponse(
      { success: false, error: "Not authenticated" },
      401,
      { "Set-Cookie": clearSessionCookie() }
    );
  }

  const session = await validateSession(token);
  if (!session) {
    return jsonResponse(
      { success: false, error: "Session expired" },
      401,
      { "Set-Cookie": clearSessionCookie() }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonResponse({ success: false, error: "Invalid request body" }, 400);
  }

  const action = String(form.get("action") || "");

  try {
    // ---------- recent (read audit log) ----------
    if (action === "recent") {
      const { data, error } = await supabaseAdmin
        .from("admin_audit_log")
        .select(
          "id, actor, action, product_ids, file_count, detail, created_at, user_id, ip_address, user_agent"
        )
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        const missing = error.code === "42P01" || /does not exist/i.test(error.message);
        return jsonResponse({
          success: true,
          entries: [],
          auditUnavailable: true,
          error: missing
            ? "Run ADMIN_AUDIT_LOG.sql in the SQL Editor."
            : error.message,
        });
      }
      return jsonResponse({ success: true, entries: data || [] });
    }

    // ---------- upload ----------
    if (action === "upload") {
      const files = form.getAll("files").filter((f): f is File => f instanceof File);
      if (!files.length) {
        return jsonResponse({ success: false, error: "No files were received." }, 400);
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

      const productId = String(form.get("productId") || "product").slice(0, 60);
      const actor = String(form.get("actor") || "").trim() || session.userEmail;

      // Ensure bucket exists
      const { error: bucketError } = await supabaseAdmin.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_BYTES,
        allowedMimeTypes: [...ACCEPTED_MIME],
      });
      if (bucketError && !/already exists/i.test(bucketError.message)) {
        console.error("ensureBucket error:", bucketError.message);
      }

      const urls: string[] = [];
      const skipped: string[] = [];
      for (const file of files) {
        const slug = productId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 60) || "product";
        const ext = (file.name.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1] || "jpg").toLowerCase();
        const stamp = Date.now().toString(36);
        const rand = crypto.randomUUID().slice(0, 8);
        const path = `products/${slug}/${stamp}-${rand}.${ext}`;

        const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, file, {
          contentType: file.type,
          cacheControl: "31536000",
          upsert: false,
        });
        if (error) {
          console.error("upload failed:", path, error.message);
          skipped.push(file.name);
          continue;
        }
        urls.push(supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
      }

      if (!urls.length) {
        return jsonResponse(
          { success: false, error: "Every upload failed. Check the bucket." },
          500
        );
      }

      // Audit log with user attribution
      await supabaseAdmin.from("admin_audit_log").insert({
        user_id: session.userId,
        action: "upload",
        product_ids: [productId],
        file_count: urls.length,
        detail: `Uploaded ${urls.length} file(s)`,
        ip_address: ip,
        user_agent: req.headers.get("user-agent") || "unknown",
      });

      return jsonResponse({ success: true, urls, skipped });
    }

    // ---------- save ----------
    if (action === "save") {
      let productIds: string[];
      let urls: string[];
      try {
        productIds = JSON.parse(String(form.get("productIds") || "[]"));
        urls = JSON.parse(String(form.get("urls") || "[]"));
      } catch {
        return jsonResponse({ success: false, error: "Malformed save payload." }, 400);
      }
      if (!Array.isArray(productIds) || !productIds.length) {
        return jsonResponse({ success: false, error: "No product selected." }, 400);
      }

      const clean = [...new Set(urls.filter((u) => typeof u === "string" && u.trim()))].filter(
        (u) => !!pathFromPublicUrl(u)
      );

      const { error } = await supabaseAdmin
        .from("products")
        .update({
          image_urls: clean.length ? clean : null,
          image_url: clean[0] ?? null,
        })
        .in("id", productIds);

      if (error) {
        console.error("save failed:", error.message);
        return jsonResponse({ success: false, error: "Could not save the photos." }, 500);
      }

      await supabaseAdmin.from("admin_audit_log").insert({
        user_id: session.userId,
        action: "save",
        product_ids: productIds,
        file_count: clean.length,
        detail: `Set ${clean.length} photo(s) on ${productIds.length} product(s)`,
        ip_address: ip,
        user_agent: req.headers.get("user-agent") || "unknown",
      });

      return jsonResponse({ success: true, urls: clean, updated: productIds.length });
    }

    // ---------- delete ----------
    if (action === "delete") {
      let urls: string[];
      try {
        urls = JSON.parse(String(form.get("urls") || "[]"));
      } catch {
        return jsonResponse({ success: false, error: "Malformed delete payload." }, 400);
      }

      const paths = [
        ...new Set(
          urls.map((u) =>
            typeof u === "string" ? pathFromPublicUrl(u) : null
          )
        ),
      ].filter((p): p is string => !!p);

      if (!paths.length) {
        return jsonResponse({ success: true, removed: [] });
      }

      const { error } = await supabaseAdmin.storage.from(BUCKET).remove(paths);
      if (error) {
        console.error("delete failed:", error.message);
        return jsonResponse(
          { success: false, error: "Could not delete the photos." },
          500
        );
      }

      await supabaseAdmin.from("admin_audit_log").insert({
        user_id: session.userId,
        action: "delete",
        product_ids: [...new Set(paths.map(productSlugFromPath))].filter(Boolean),
        file_count: paths.length,
        detail: `Deleted ${paths.length} file(s) from storage`,
        ip_address: ip,
        user_agent: req.headers.get("user-agent") || "unknown",
      });

      return jsonResponse({ success: true, removed: paths });
    }

    return jsonResponse({ success: false, error: "Unknown action." }, 400);
  } catch (err) {
    console.error("admin-images error:", err);
    return jsonResponse({ success: false, error: "Unexpected server error." }, 500);
  }
});

/** `/storage/v1/object/public/<bucket>/<path>` -> `<path>`, else null. */
function pathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const raw = url.slice(idx + marker.length);
  const path = decodeURIComponent(raw).replace(/^\/+/, "");
  if (!path || !path.startsWith("products/")) return null;
  return path;
}

/** `products/<slug>/<file>` -> `<slug>`, else ''. */
function productSlugFromPath(path: string): string {
  return path.match(/^products\/([^/]+)\//)?.[1] || "";
}
