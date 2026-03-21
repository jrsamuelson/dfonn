import { getStore } from "@netlify/blobs";
import {
  appendAuthHeaders,
  createClearSessionCookie,
  getAuthConfig,
  getAuthStatus,
} from "./_onn-auth.mjs";

const STORE_NAME = "onn-scheduler-v1";
const EXACT_KEYS = new Set([
  "onn_team_nextid_v1",
  "onn_team_v2",
  "onn_settings_v1",
]);
const WEEK_KEY_RE = /^onn_week5_\d{4}-\d{2}-\d{2}$/;
const WEEK_LOCK_KEY_RE = /^onn_week5_lock_\d{4}-\d{2}-\d{2}$/;

function json(body, init = {}, config = getAuthConfig()) {
  const headers = new Headers(init.headers || {});
  headers.set("cache-control", "no-store");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-onn-storage", "1");
  appendAuthHeaders(headers, config);

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

function errorResponse(status, message, config = getAuthConfig(), extraHeaders = {}) {
  return json({ error: message }, {
    status,
    headers: extraHeaders,
  }, config);
}

function isAllowedKey(key) {
  return EXACT_KEYS.has(key) || WEEK_KEY_RE.test(key) || WEEK_LOCK_KEY_RE.test(key);
}

function isAllowedPrefix(prefix) {
  return prefix === "" || prefix === "onn_week5_";
}

export default async function handler(request) {
  const url = new URL(request.url);
  const store = getStore(STORE_NAME);
  const authConfig = getAuthConfig();
  const authStatus = getAuthStatus(request, authConfig);

  try {
    if (authConfig.enabled && !authStatus.authenticated) {
      return errorResponse(401, "Authentication required.", authConfig, {
        "set-cookie": createClearSessionCookie(request.url, authConfig),
      });
    }

    if (request.method === "GET" && url.searchParams.get("list") === "1") {
      const prefix = url.searchParams.get("prefix") || "";

      if (!isAllowedPrefix(prefix)) {
        return errorResponse(400, "Unsupported key prefix.", authConfig);
      }

      const { blobs } = await store.list({ prefix });
      const keys = blobs.map((blob) => blob.key).sort();

      return json({ keys }, {}, authConfig);
    }

    const key = url.searchParams.get("key") || "";

    if (!isAllowedKey(key)) {
      return errorResponse(400, "Unsupported storage key.", authConfig);
    }

    if (request.method === "GET") {
      const blob = await store.getWithMetadata(key, { type: "text" });

      if (!blob) {
        return errorResponse(404, "Key not found.", authConfig);
      }

      return json({
        etag: blob.etag,
        key,
        metadata: blob.metadata || null,
        value: blob.data,
      }, {}, authConfig);
    }

    if (request.method === "PUT") {
      const value = await request.text();
      const onlyIfMatch = request.headers.get("if-match");
      const onlyIfNew = request.headers.get("if-none-match") === "*";
      const result = await store.set(key, value, {
        metadata: { savedAt: new Date().toISOString() },
        ...(onlyIfMatch ? { onlyIfMatch } : {}),
        ...(onlyIfNew ? { onlyIfNew: true } : {}),
      });

      if (!result.modified) {
        return errorResponse(409, "The stored data changed before this save completed.", authConfig);
      }

      return json({
        etag: result.etag || null,
        ok: true,
      }, {}, authConfig);
    }

    if (request.method === "DELETE") {
      await store.delete(key);
      return json({ ok: true }, {}, authConfig);
    }

    return errorResponse(405, "Method not allowed.", authConfig);
  } catch (error) {
    console.error("ONN storage function error:", error);
    return errorResponse(500, "Shared storage request failed.", authConfig);
  }
}
