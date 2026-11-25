// Auth logic: session management, rate limiting, user lookup
// Uses PostgreSQL via Supabase service-role client

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  hashPassword,
  comparePassword,
  generateToken,
  hashToken,
  constantTimeEquals,
} from "./crypto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Session constants
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const SESSION_MAX_LIFETIME_MS = 8 * 60 * 60 * 1000; // 8 hours
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 5;

/** In-memory rate limit store (per IP + per email).
 * Note: Edge Functions may be stateless across invocations, so this is
 * a best-effort in-memory store. For production, consider Redis or
 * storing rate limit data in the database.
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function rateLimitKey(ip: string, email?: string): string {
  return `${ip}:${email || "anonymous"}`;
}

export function checkRateLimit(ip: string, email?: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const key = rateLimitKey(ip, email);
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX_ATTEMPTS - 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }

  if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX_ATTEMPTS - entry.count, resetAt: entry.resetAt };
}

export function recordRateLimitFailure(ip: string, email?: string): void {
  const key = rateLimitKey(ip, email);
  const now = Date.now();
  const entry = rateLimitStore.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  entry.count++;
  entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
  rateLimitStore.set(key, entry);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/** Find a user by email. Returns null if not found. */
export async function findUserByEmail(email: string) {
  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("*")
    .eq("email", email.toLowerCase())
    .single();
  if (error || !data) return null;
  return data;
}

/** Create a session for a user. Returns the plaintext session token. */
export async function createSession(userId: string, ipAddress?: string, userAgent?: string): Promise<string> {
  const token = generateToken();
  const tokenHash = await hashToken(token);
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_MAX_LIFETIME_MS).toISOString();

  const { error } = await supabaseAdmin.from("admin_sessions").insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    ip_address: ipAddress,
    user_agent: userAgent,
  });

  if (error) throw new Error("Failed to create session");
  return token;
}

/** Validate a session token. Returns the user record if valid, null otherwise.
 * Also updates last_seen_at and enforces idle timeout. */
export async function validateSession(token: string): Promise<any | null> {
  const tokenHash = await hashToken(token);

  const { data: sessions, error } = await supabaseAdmin
    .from("admin_sessions")
    .select("*, user_id (*)")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !sessions) return null;

  const now = Date.now();
  const lastSeen = new Date(sessions.last_seen_at).getTime();
  const idleTimeoutMs = now - lastSeen;

  // Check idle timeout (30 minutes)
  if (idleTimeoutMs > SESSION_IDLE_TIMEOUT_MS) {
    await supabaseAdmin.from("admin_sessions").delete().eq("id", sessions.id);
    return null;
  }

  // Update last_seen_at
  await supabaseAdmin
    .from("admin_sessions")
    .update({ last_seen_at: new Date(now).toISOString() })
    .eq("id", sessions.id);

  const user = sessions.user_id;
  if (!user || !user.totp_enabled) {
    // User exists but 2FA not enforced yet - still valid but mark as needing 2FA
    return { ...user, session_valid: true, mfa_required: false };
  }

  return { ...user, session_valid: true, mfa_required: true };
}

/** Delete a session (logout). */
export async function deleteSession(token: string): Promise<void> {
  const tokenHash = await hashToken(token);
  await supabaseAdmin.from("admin_sessions").delete().eq("token_hash", tokenHash);
}

/** Delete all sessions for a user. */
export async function deleteAllSessions(userId: string): Promise<void> {
  await supabaseAdmin.from("admin_sessions").delete().eq("user_id", userId);
}

/** Check if user account is locked. */
export function isLocked(user: any): { locked: boolean; remainingMs?: number } {
  if (!user.locked_until) return { locked: false };
  const now = Date.now();
  const lockUntil = new Date(user.locked_until).getTime();
  if (now < lockUntil) {
    return { locked: true, remainingMs: lockUntil - now };
  }
  // Lock expired, reset
  return { locked: false };
}

/** Record a failed login attempt. Locks account after RATE_LIMIT_MAX_ATTEMPTS. */
export async function recordFailedLogin(user: any): Promise<void> {
  const attempts = (user.failed_login_attempts || 0) + 1;
  const updates: any = { failed_login_attempts: attempts };

  if (attempts >= RATE_LIMIT_MAX_ATTEMPTS) {
    const lockUntil = new Date(Date.now() + RATE_LIMIT_WINDOW_MS).toISOString();
    updates.locked_until = lockUntil;
  }

  await supabaseAdmin.from("admin_users").update(updates).eq("id", user.id);
}

/** Reset failed login attempts on successful login. */
export async function resetFailedLogin(userId: string): Promise<void> {
  await supabaseAdmin
    .from("admin_users")
    .update({
      failed_login_attempts: 0,
      locked_until: null,
      last_login_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
}
