import crypto from "node:crypto";

const SESSION_COOKIE_NAME = "onn_shared_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function hashString(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest();
}

function secureStringEqual(a, b) {
  return crypto.timingSafeEqual(hashString(a), hashString(b)) && String(a || "").length === String(b || "").length;
}

function toBase64Url(input) {
  return Buffer.from(String(input || ""), "utf8").toString("base64url");
}

function fromBase64Url(input) {
  return Buffer.from(String(input || ""), "base64url").toString("utf8");
}

function signPayload(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function parseCookies(cookieHeader) {
  const cookies = {};
  String(cookieHeader || "").split(";").forEach(part => {
    const trimmed = part.trim();
    if (!trimmed) return;
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      cookies[trimmed] = "";
      return;
    }
    cookies[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  });
  return cookies;
}

function shouldUseSecureCookie(requestUrl) {
  try {
    return new URL(requestUrl).protocol === "https:";
  } catch {
    return false;
  }
}

export function getAuthConfig() {
  const password = String(process.env.ONN_SHARED_PASSWORD || "").trim();
  const secret = String(process.env.ONN_SESSION_SECRET || password).trim();

  return {
    enabled: password.length > 0,
    password,
    secret,
    cookieName: SESSION_COOKIE_NAME,
    sessionMaxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function appendAuthHeaders(headers, config = getAuthConfig()) {
  headers.set("x-onn-auth", "1");
  headers.set("x-onn-auth-enabled", config.enabled ? "1" : "0");
  return headers;
}

export function createSessionCookie(requestUrl, config = getAuthConfig()) {
  const expiresAt = Date.now() + config.sessionMaxAge * 1000;
  const payload = toBase64Url(JSON.stringify({ exp: expiresAt }));
  const signature = signPayload(payload, config.secret);
  const parts = [
    `${config.cookieName}=${payload}.${signature}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${config.sessionMaxAge}`,
  ];

  if (shouldUseSecureCookie(requestUrl)) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function createClearSessionCookie(requestUrl, config = getAuthConfig()) {
  const parts = [
    `${config.cookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];

  if (shouldUseSecureCookie(requestUrl)) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function isPasswordValid(candidate, config = getAuthConfig()) {
  if (!config.enabled) return true;
  return secureStringEqual(candidate, config.password);
}

export function getAuthStatus(request, config = getAuthConfig()) {
  if (!config.enabled) {
    return {
      enabled: false,
      authenticated: true,
    };
  }

  const cookies = parseCookies(request.headers.get("cookie"));
  const token = cookies[config.cookieName];

  if (!token) {
    return {
      enabled: true,
      authenticated: false,
    };
  }

  const [payload, signature] = String(token).split(".");
  if (!payload || !signature) {
    return {
      enabled: true,
      authenticated: false,
    };
  }

  const expectedSignature = signPayload(payload, config.secret);
  if (!secureStringEqual(signature, expectedSignature)) {
    return {
      enabled: true,
      authenticated: false,
    };
  }

  try {
    const parsed = JSON.parse(fromBase64Url(payload));
    const expiresAt = Number(parsed?.exp || 0);

    if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
      return {
        enabled: true,
        authenticated: false,
      };
    }

    return {
      enabled: true,
      authenticated: true,
      expiresAt,
    };
  } catch {
    return {
      enabled: true,
      authenticated: false,
    };
  }
}
