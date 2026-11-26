// supabase/functions/admin-offers/index.ts
//
// Server-side only. Deploy with: supabase functions deploy admin-offers
//
// Offer management via Edge Function.
// Auth: session cookie (set by admin-auth) + CSRF token header.
//
// Requests:
//   GET  /functions/v1/admin-offers          -> list ALL offers (incl. inactive)
//   POST action=create  ...                 -> create offer
//   POST action=update  id=<uuid> ...       -> update offer
//   POST action=delete  id=<uuid>           -> delete offer
//   POST action=recent                      -> read audit log
//
// Cookie: mnx_admin_session=<session_token>
// X-CSRF-Token: <csrf_token>  (for state-changing actions)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SESSION_COOKIE_NAME = "mnx_admin_session";
const CSRF_COOKIE_NAME = "mnx_admin_csrf";
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_MAX_LIFETIME_MS = 8 * 60 * 60 * 1000;
const EXPECTED_ORIGIN = Deno.env.get("VITE_SITE_URL") || "https://mnx-shop.vercel.app";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": EXPECTED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
  return `${CSRF_COOKIE_NAME}=; Secure; SameSite=None; Path=/; Max-Age=0`;
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

  const lastSeen = new Date(session.last_seen_at).getTime();
  const nowMs = Date.now();
  if (nowMs - lastSeen > SESSION_IDLE_TIMEOUT_MS) {
    await supabaseAdmin.from("admin_sessions").delete().eq("id", session.id);
    return null;
  }

  const createdAt = new Date(session.created_at).getTime();
  if (nowMs - createdAt > SESSION_MAX_LIFETIME_MS) {
    await supabaseAdmin.from("admin_sessions").delete().eq("id", session.id);
    return null;
  }

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

  if (req.method === "POST") {
    if (origin !== EXPECTED_ORIGIN) {
      return jsonResponse({ success: false, error: "Invalid origin" }, 403);
    }
    const csrfHeader = req.headers.get("x-csrf-token");
    if (!validateCsrf(cookieHeader, csrfHeader)) {
      return jsonResponse({ success: false, error: "Invalid CSRF token" }, 403);
    }
  }

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
    // ---------- list (admin reads everything, incl. inactive) ----------
    if (req.method === "GET" || action === "list" || action === "recent") {
      const limit = action === "recent" ? 50 : 1000;
      const { data, error } = await supabaseAdmin
        .from("offers")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        return jsonResponse({ success: false, error: "Could not load offers." }, 500);
      }
      if (action === "recent") {
        const { data: entries, error: auditError } = await supabaseAdmin
          .from("admin_audit_log")
          .select(
            "id, actor, action, product_ids, file_count, detail, created_at, user_id, ip_address, user_agent"
          )
          .order("created_at", { ascending: false })
          .limit(50);
        if (auditError) {
          const missing = /does not exist/i.test(auditError.message);
          return jsonResponse({
            success: true,
            entries: [],
            auditUnavailable: true,
            error: missing
              ? "Run ADMIN_AUDIT_LOG.sql in the SQL Editor."
              : auditError.message,
          });
        }
        return jsonResponse({ success: true, entries: entries || [] });
      }
      return jsonResponse({ success: true, offers: data || [] });
    }

    // ---------- create ----------
    if (action === "create") {
      const productId = String(form.get("productId") || "").trim();
      const title = String(form.get("title") || "").trim();
      const subtitle = String(form.get("subtitle") || "").trim() || null;
      const kind = String(form.get("kind") || "").trim();
      const active = String(form.get("active") || "true") === "true";
      const startsAt = String(form.get("startsAt") || "") || null;
      const endsAt = String(form.get("endsAt") || "") || null;

      let config: Record<string, unknown> = {};
      try {
        config = JSON.parse(String(form.get("config") || "{}"));
      } catch {
        return jsonResponse({ success: false, error: "Invalid config." }, 400);
      }

      if (!productId || !title || !kind) {
        return jsonResponse({ success: false, error: "Missing required fields." }, 400);
      }

      const insertPayload: Record<string, unknown> = {
        product_id: productId,
        title,
        subtitle,
        kind,
        config,
        active,
      };
      if (startsAt) insertPayload["starts_at"] = startsAt;
      if (endsAt) insertPayload["ends_at"] = endsAt;

      const { data, error } = await supabaseAdmin
        .from("offers")
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        console.error("create failed:", error.message);
        return jsonResponse({ success: false, error: "Could not create offer." }, 500);
      }
      await supabaseAdmin.from("admin_audit_log").insert({
        user_id: session.userId,
        action: "create",
        product_ids: [data.id],
        detail: `Created offer "${title}"`,
        ip_address: ip,
        user_agent: req.headers.get("user-agent") || "unknown",
      });
      return jsonResponse({ success: true, offer: data });
    }

    // ---------- update ----------
    if (action === "update") {
      const id = String(form.get("id") || "").trim();
      if (!id) {
        return jsonResponse({ success: false, error: "Missing offer id." }, 400);
      }

      const updates: Record<string, unknown> = {};
      for (const field of [
        "title",
        "subtitle",
        "kind",
        "config",
        "active",
        "starts_at",
        "ends_at",
      ]) {
        const raw = form.get(field);
        if (raw === null || raw === undefined) continue;
        const val = String(raw).trim();
        if (val === "") continue;
        if (field === "config") {
          try {
            updates[field] = JSON.parse(val);
          } catch {
            return jsonResponse({ success: false, error: "Invalid config." }, 400);
          }
        } else if (field === "active") {
          updates[field] = val === "true";
        } else {
          updates[field] = val;
        }
      }

      if (Object.keys(updates).length === 0) {
        return jsonResponse({ success: false, error: "Nothing to update." }, 400);
      }

      const { data, error } = await supabaseAdmin
        .from("offers")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("update failed:", error.message);
        return jsonResponse({ success: false, error: "Could not update offer." }, 500);
      }
      await supabaseAdmin.from("admin_audit_log").insert({
        user_id: session.userId,
        action: "update",
        product_ids: [data.product_id],
        detail: `Updated offer "${data.title}"`,
        ip_address: ip,
        user_agent: req.headers.get("user-agent") || "unknown",
      });
      return jsonResponse({ success: true, offer: data });
    }

    // ---------- delete ----------
    if (action === "delete") {
      const id = String(form.get("id") || "").trim();
      if (!id) {
        return jsonResponse({ success: false, error: "Missing offer id." }, 400);
      }

      const { data: before, error: beforeError } = await supabaseAdmin
        .from("offers")
        .select("id, product_id, title")
        .eq("id", id)
        .single();

      if (beforeError || !before) {
        return jsonResponse({ success: false, error: "Offer not found." }, 404);
      }

      const { error } = await supabaseAdmin.from("offers").delete().eq("id", id);
      if (error) {
        console.error("delete failed:", error.message);
        return jsonResponse({ success: false, error: "Could not delete offer." }, 500);
      }
      await supabaseAdmin.from("admin_audit_log").insert({
        user_id: session.userId,
        action: "delete",
        product_ids: [before.product_id],
        detail: `Deleted offer "${before.title}"`,
        ip_address: ip,
        user_agent: req.headers.get("user-agent") || "unknown",
      });
      return jsonResponse({ success: true, id });
    }

    return jsonResponse({ success: false, error: "Unknown action." }, 400);
  } catch (err) {
    console.error("admin-offers error:", err);
    return jsonResponse({ success: false, error: "Unexpected server error." }, 500);
  }
});
