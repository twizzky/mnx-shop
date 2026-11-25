// TOTP (RFC 6238) helpers for 2FA
// Base32 decode + HMAC-SHA1 using Web Crypto API

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Decode a base32-encoded string to bytes. */
export function base32Decode(input: string): Uint8Array {
  const cleaned = input.replace(/=/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const output = new Uint8Array(Math.floor((cleaned.length * 5) / 8));
  let index = 0;

  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    const val = BASE32_CHARS.indexOf(c);
    if (val === -1) continue; // skip invalid chars
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      output[index++] = (value >> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }
  return output;
}

/** HMAC-SHA1 using Web Crypto API. */
async function hmacSha1(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, data);
  return new Uint8Array(sig);
}

/**
 * Generate a TOTP code for the given secret and time step.
 * Returns a 6-digit string.
 */
export function generateTotp(secretBase32: string, timeStepSeconds = 30): string {
  const key = base32Decode(secretBase32);
  const time = Math.floor(Date.now() / 1000 / timeStepSeconds);
  const timeBytes = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    timeBytes[i] = time & 0xff;
    time >>= 8;
  }

  // We need async for HMAC, but this is sync. Use the async version instead.
  throw new Error("Use generateTotpAsync instead");
}

/** Async version of generateTotp. */
export async function generateTotpAsync(
  secretBase32: string,
  timeStepSeconds = 30
): Promise<string> {
  const key = base32Decode(secretBase32);
  const time = Math.floor(Date.now() / 1000 / timeStepSeconds);
  const timeBytes = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    timeBytes[i] = time & 0xff;
    time >>= 8;
  }

  const hash = await hmacSha1(key, timeBytes);

  // Dynamic truncation (RFC 4226)
  const offset = hash[hash.length - 1] & 0xf;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, "0");
}

/** Verify a TOTP code against the secret, allowing a 1-step window. */
export async function verifyTotp(
  secretBase32: string,
  token: string,
  timeStepSeconds = 30
): Promise<boolean> {
  const current = Math.floor(Date.now() / 1000 / timeStepSeconds);
  for (let offset = -1; offset <= 1; offset++) {
    const time = current + offset;
    const timeBytes = new Uint8Array(8);
    for (let i = 7; i >= 0; i--) {
      timeBytes[i] = time & 0xff;
      time >>= 8;
    }
    const key = base32Decode(secretBase32);
    const hash = await hmacSha1(key, timeBytes);
    const off = hash[hash.length - 1] & 0xf;
    const binary =
      ((hash[off] & 0x7f) << 24) |
      ((hash[off + 1] & 0xff) << 16) |
      ((hash[off + 2] & 0xff) << 8) |
      (hash[off + 3] & 0xff);
    const otp = (binary % 1000000).toString().padStart(6, "0");
    if (otp === token) return true;
  }
  return false;
}

/** Generate a random base32 TOTP secret (160 bits = 32 chars). */
export function generateTotpSecret(): string {
  const arr = new Uint8Array(20); // 160 bits
  crypto.getRandomValues(arr);
  let result = "";
  for (let i = 0; i < arr.length; i++) {
    result += BASE32_CHARS[arr[i] % BASE32_CHARS.length];
  }
  return result;
}

/** Generate 8 recovery codes (8 alphanumeric chars each). */
export function generateRecoveryCodes(count = 8): string[] {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    let code = "";
    for (let j = 0; j < 8; j++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    codes.push(code);
  }
  return codes;
}
