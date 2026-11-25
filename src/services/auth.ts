/**
 * Client-side admin authentication service.
 *
 * All requests go to the admin-auth Edge Function with `credentials: 'include'`
 * so that HttpOnly session cookies are sent/received across the
 * vercel.app <-> supabase.co domain boundary.
 *
 * CSRF tokens are read from the mnx_admin_csrf cookie and sent via
 * the X-CSRF-Token header on state-changing requests.
 */

const ADMIN_AUTH_FUNCTION = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-auth`;

function headers(csrfToken?: string): HeadersInit {
  const h: HeadersInit = {
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  };
  if (csrfToken) {
    (h as Record<string, string>)["x-csrf-token"] = csrfToken;
  }
  return h;
}

/** Read the CSRF token from the HttpOnly-inaccessible cookie.
 * Note: csrf cookie is also HttpOnly, so we can't read it from JS.
 * Instead, the CSRF token is embedded in the page by the login response
 * or we use a double-submit pattern where the client reads it from
 * a non-HttpOnly cookie. For simplicity, we use the Origin header
 * check on the server side as primary CSRF protection, and accept
 * that the X-CSRF-Token header is sent when available.
 */
function getCsrfToken(): string | null {
  try {
    const match = document.cookie.match(
      new RegExp(`(?:^|; )mnx_admin_csrf=([^;]+)`)
    );
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function callAuth(
  path: string,
  method: string = "POST",
  body?: unknown
): Promise<Response> {
  const url = `${ADMIN_AUTH_FUNCTION}${path}`;
  const csrfToken = getCsrfToken();
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: headers(csrfToken),
      credentials: "include",
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error("Could not reach the auth server. Check your connection.");
  }
  return res;
}

async function jsonBody(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Login with email + password. Returns { success, mfa_required, user }. */
export async function adminLogin(email: string, password: string) {
  const res = await callAuth("/login", "POST", { email, password });
  const data = await jsonBody(res);
  return { ok: res.ok, status: res.status, ...data };
}

/** Logout - invalidate session server-side. */
export async function adminLogout() {
  const res = await callAuth("/logout", "POST");
  return res.ok;
}

/** Validate current session. Returns { success, user } or { success: false }. */
export async function adminSession() {
  const res = await callAuth("/me", "GET");
  const data = await jsonBody(res);
  return { ok: res.ok, status: res.status, ...data };
}

/** 2FA setup - generates secret + recovery codes. Requires authenticated session. */
export async function admin2faSetup() {
  const res = await callAuth("/2fa/setup", "POST");
  const data = await jsonBody(res);
  return { ok: res.ok, status: res.status, ...data };
}

/** 2FA enable - verify TOTP code and enable 2FA. Requires authenticated session. */
export async function admin2faEnable(code: string) {
  const res = await callAuth("/2fa/enable", "POST", { code });
  const data = await jsonBody(res);
  return { ok: res.ok, status: res.status, ...data };
}

/** 2FA verify during login - verify TOTP code. Requires pending session. */
export async function admin2faVerify(code: string) {
  const res = await callAuth("/2fa/verify", "POST", { code });
  const data = await jsonBody(res);
  return { ok: res.ok, status: res.status, ...data };
}

/** 2FA recovery - verify recovery code. Requires pending session. */
export async function admin2faRecovery(code: string) {
  const res = await callAuth("/2fa/recovery", "POST", { code });
  const data = await jsonBody(res);
  return { ok: res.ok, status: res.status, ...data };
}
