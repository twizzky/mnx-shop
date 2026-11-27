// Crypto helpers for admin auth
// Uses bcryptjs (pure JS, works in Deno Edge Functions)
// Password cost: 12 (meets requirement of >= 12)

import * as bcrypt from "https://esm.sh/bcryptjs";

const SALT_ROUNDS = 12;

/** Hash a plaintext password with bcrypt. Never stores plaintext. */
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

/** Constant-time comparison of a plaintext password against a bcrypt hash. */
export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

/** Constant-time string comparison to prevent timing attacks. */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Generate a cryptographically random session token. */
export function generateToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hash a token for storage (deterministic SHA-256 so it can be looked up). */
export async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
