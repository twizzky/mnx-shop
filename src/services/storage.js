import { supabase } from './supabase';

// Product photos live in a public Supabase Storage bucket. Reads are
// plain public URLs (no auth, which is what lets `format.js` render them
// from a plain <img>); writes go through the `admin-images` Edge Function,
// which holds the admin PIN and the service-role key server-side. See
// SUPABASE_SETUP.md §1.1.

export const PRODUCT_IMAGE_BUCKET = 'product-images';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 10;

const ACCEPTED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
];

export function isStorageConfigured() {
  return !!supabase;
}

/**
 * Client-side pre-flight check, so an obviously-bad file never costs an
 * upload round-trip. The Edge Function re-validates server-side — this is
 * a convenience, not a trust boundary.
 */
export function validateImageFile(file) {
  if (!ACCEPTED_MIME.includes(file.type)) {
    return `${file.name}: use JPG, PNG, WEBP, GIF or AVIF.`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `${file.name}: ${formatBytes(file.size)} is over the 5 MB limit.`;
  }
  return null;
}

/** Screenshots on phones are routinely >5 MB; converting client-side
 *  keeps them uploadable without asking anyone to open an image editor. */
export async function shrinkImage(file, maxEdge = 1600) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  // JPEG has no alpha channel; fill white first so transparent PNGs don't
  // come out with black backgrounds after re-encoding.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  // Re-encoding only pays off if the result is actually smaller.
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
    type: 'image/jpeg',
  });
}

/** True when `url` is a photo this app owns and can therefore delete. */
export function isManagedImageUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  return url.includes(`/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/products/`);
}

/**
 * Single entry point to the admin-images function. Keeps the URL shape,
 * auth headers and error normalisation in one place.
 *
 * The PIN does NOT go in `Authorization`: Supabase's gateway validates
 * that header as a JWT and answers 401 Invalid JWT before the function is
 * ever invoked. The anon key goes there instead, and the PIN rides along in
 * its own header (plus a form field, as a proxy-stripping fallback).
 */
async function callAdminImages(formData, pin) {
  if (!supabase) {
    throw new Error('Supabase is not configured in this environment.');
  }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-images`;
  formData.append('pin', pin);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'x-admin-pin': pin,
      },
      body: formData,
    });
  } catch {
    throw new Error('Could not reach the image server. Check your connection.');
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    // A wrong PIN and a stale/rotated secret are indistinguishable to the
    // caller by design, but the message still has to be actionable.
    if (res.status === 401) throw new Error('Incorrect PIN.');
    // A bare 404 from the platform means the function was never deployed
    // (or the project has no functions enabled) — a very common first-run
    // state, so it gets a pointed message rather than "not found".
    if (res.status === 404) {
      throw new Error('The admin-images function is not deployed yet. See SUPABASE_SETUP.md §1.1.');
    }
    throw new Error(payload?.error || `Upload failed (HTTP ${res.status}).`);
  }
  return payload;
}

/** Uploads files to the bucket and returns their public URLs. */
export async function uploadProductImages({ productId, files, pin }) {
  const form = new FormData();
  form.append('action', 'upload');
  form.append('productId', productId);
  for (const file of files) form.append('files', file, file.name);
  const data = await callAdminImages(form, pin);
  return { urls: data.urls || [], skipped: data.skipped || [] };
}

/** Replaces the photo list on one or more product rows. */
export async function saveProductImages({ productIds, urls, pin }) {
  const form = new FormData();
  form.append('action', 'save');
  form.append('productIds', JSON.stringify(productIds));
  form.append('urls', JSON.stringify(urls));
  return callAdminImages(form, pin);
}

/** Permanently removes objects from the bucket. Ignored for any URL not
 *  hosted in our own `product-images/products/` folder. */
export async function deleteProductImages({ urls, pin }) {
  const form = new FormData();
  form.append('action', 'delete');
  form.append('urls', JSON.stringify(urls));
  return callAdminImages(form, pin);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}