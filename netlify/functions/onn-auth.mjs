import {
  appendAuthHeaders,
  createClearSessionCookie,
  createSessionCookie,
  getAuthConfig,
  getAuthStatus,
  isPasswordValid,
} from "./_onn-auth.mjs";

function json(body, init = {}, config = getAuthConfig()) {
  const headers = new Headers(init.headers || {});
  headers.set("cache-control", "no-store");
  headers.set("content-type", "application/json; charset=utf-8");
  appendAuthHeaders(headers, config);

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

export default async function handler(request) {
  const config = getAuthConfig();
  const url = new URL(request.url);
  const action = (url.searchParams.get("action") || "status").toLowerCase();

  try {
    if (request.method === "GET" && action === "status") {
      const status = getAuthStatus(request, config);
      return json({
        enabled: status.enabled,
        authenticated: status.authenticated,
      }, {}, config);
    }

    if (request.method === "POST" && action === "login") {
      if (!config.enabled) {
        return json({
          enabled: false,
          authenticated: true,
        }, {}, config);
      }

      const payload = await request.json().catch(() => null);
      const password = String(payload?.password || "");

      if (!isPasswordValid(password, config)) {
        return json({
          enabled: true,
          authenticated: false,
          error: "Incorrect password.",
        }, { status: 401 }, config);
      }

      return json({
        enabled: true,
        authenticated: true,
      }, {
        headers: {
          "set-cookie": createSessionCookie(request.url, config),
        },
      }, config);
    }

    if (request.method === "POST" && action === "logout") {
      return json({
        enabled: config.enabled,
        authenticated: !config.enabled,
      }, {
        headers: {
          "set-cookie": createClearSessionCookie(request.url, config),
        },
      }, config);
    }

    return json({
      error: "Method not allowed.",
    }, { status: 405 }, config);
  } catch (error) {
    console.error("ONN auth function error:", error);
    return json({
      error: "Authentication request failed.",
    }, { status: 500 }, config);
  }
}
