// supabase/functions/admin-orders/index.ts
//
// Server-side only. Deploy with: supabase functions deploy admin-orders
//
// Order management via Edge Function.
// Auth: session cookie (set by admin-auth) + CSRF token header.
//
// Requests:
//   GET  /functions/v1/admin-orders           -> list ALL orders (newest first)
//   PATCH ?id=<uuid>&status=<new>  -> update order status
//
// Cookie: mnx_admin_session=<session_token>
// X-CSRF-Token: <csrf_token>  (for state-changing actions)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN")!;

const SESSION_COOKIE_NAME = "mnx_admin_session";
const CSRF_COOKIE_NAME = "csrf";
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_MAX_LIFETIME_MS = 8 * 60 * 60 * 1000;

const ALLOWED_STATUSES = new Set([
  "pending",
  "confirmed",
  "shipped",
  "delayed",
  "no answer",
  "no answer 1",
  "no answer 2",
  "no answer 3",
  "cancelled",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-csrf-token",
  "Access-Control-Allow-Credentials": "true",
  "Vary": "Origin",
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

  if (req.method === "PATCH") {
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

  try {
    // ---------- list orders ----------
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("orders")
        .select("*, order_items(*, products(*))")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("list orders failed:", error.message);
        return jsonResponse({ success: false, error: "Could not load orders." }, 500);
      }
      return jsonResponse({ success: true, orders: data || [] });
    }

    // ---------- update status / notes ----------
    if (req.method === "PATCH") {
      const id = url.searchParams.get("id") || "";
      const status = url.searchParams.get("status") || undefined;
      const notes = url.searchParams.get("notes") || undefined;

      if (!id) {
        return jsonResponse({ success: false, error: "Missing order id." }, 400);
      }
      if (status === undefined && notes === undefined) {
        return jsonResponse({ success: false, error: "Nothing to update." }, 400);
      }

      const { data: before, error: beforeError } = await supabaseAdmin
        .from("orders")
        .select("id, order_number, customer_name, status, notes")
        .eq("id", id)
        .single();

      if (beforeError || !before) {
        return jsonResponse({ success: false, error: "Order not found." }, 404);
      }

      const updates: Record<string, unknown> = {};
      let detailParts: string[] = [];

      if (status !== undefined) {
        if (!ALLOWED_STATUSES.has(status)) {
          return jsonResponse({ success: false, error: "Invalid status." }, 400);
        }
        updates.status = status;
        detailParts.push(`status: ${before.status} -> ${status}`);
      }

      if (notes !== undefined) {
        updates.notes = notes;
        detailParts.push(`notes updated`);
      }

      const { error } = await supabaseAdmin
        .from("orders")
        .update(updates)
        .eq("id", id);

      if (error) {
        console.error("update order failed:", error.message);
        return jsonResponse(
          { success: false, error: "Could not update order." },
          500
        );
      }

      await supabaseAdmin.from("admin_audit_log").insert({
        user_id: session.userId,
        action: "update",
        product_ids: [id],
        detail: `Order ${before.order_number} ${detailParts.join(", ")}`,
        ip_address: ip,
        user_agent: req.headers.get("user-agent") || "unknown",
      });
      return jsonResponse({ success: true, id, status, notes });
    }

    return jsonResponse({ success: false, error: "Unknown method." }, 405);
  } catch (err) {
    console.error("admin-orders error:", err);
    return jsonResponse({ success: false, error: "Unexpected server error." }, 500);
  }
});
