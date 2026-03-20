(function () {
  const LOCAL_NAMESPACE = "onn_scheduler:";
  const STORAGE_ENDPOINT = "/.netlify/functions/onn-storage";
  const WEEK_KEY_RE = /^onn_week5_\d{4}-\d{2}-\d{2}$/;

  function createLocalStorageBackend(namespace) {
    const keyFor = (key) => `${namespace}${key}`;

    return {
      name: "localStorage",

      async get(key) {
        const value = localStorage.getItem(keyFor(key));
        return value == null ? null : { value };
      },

      async set(key, value) {
        localStorage.setItem(keyFor(key), value);
      },

      async delete(key) {
        localStorage.removeItem(keyFor(key));
      },

      async list(prefix) {
        const fullPrefix = keyFor(prefix || "");
        const keys = [];

        for (let index = 0; index < localStorage.length; index += 1) {
          const rawKey = localStorage.key(index);
          if (!rawKey || !rawKey.startsWith(fullPrefix)) continue;
          keys.push(rawKey.slice(namespace.length));
        }

        keys.sort();
        return { keys };
      },
    };
  }

  function withQuery(params) {
    const url = new URL(STORAGE_ENDPOINT, window.location.origin);

    Object.entries(params).forEach(([key, value]) => {
      if (value == null) return;
      url.searchParams.set(key, String(value));
    });

    return url.toString();
  }

  function makeError(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  async function readJson(response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  async function buildResponseError(response, fallbackMessage) {
    const payload = await readJson(response);
    const detail = typeof payload?.error === "string" ? payload.error : "";
    return makeError(detail ? `${fallbackMessage} ${detail}` : fallbackMessage, "storage");
  }

  function createAutoNetlifyBackend() {
    const local = createLocalStorageBackend(LOCAL_NAMESPACE);
    const etags = new Map();
    let mode = window.location.protocol === "file:" ? "local" : "unknown";

    function setMode(nextMode) {
      mode = nextMode;
    }

    async function request(url, init) {
      try {
        const response = await fetch(url, {
          ...init,
          cache: "no-store",
          credentials: "same-origin",
        });

        if (response.headers.get("x-onn-storage") !== "1") {
          if (mode === "unknown") {
            setMode("local");
            return null;
          }

          throw makeError(
            "Shared storage endpoint did not respond with ONN storage headers.",
            "storage",
          );
        }

        setMode("remote");
        return response;
      } catch (error) {
        if (mode === "unknown") {
          setMode("local");
          return null;
        }

        throw error;
      }
    }

    return {
      get name() {
        return mode === "remote" ? "Netlify shared storage" : "localStorage";
      },

      async get(key) {
        if (mode === "local") {
          return local.get(key);
        }

        const response = await request(withQuery({ key }), { method: "GET" });

        if (response === null) {
          return local.get(key);
        }

        if (response.status === 404) {
          etags.set(key, null);
          return null;
        }

        if (!response.ok) {
          throw await buildResponseError(response, "Failed to load shared data.");
        }

        const payload = await readJson(response);

        if (typeof payload?.etag === "string") {
          etags.set(key, payload.etag);
        } else {
          etags.delete(key);
        }

        if (typeof payload?.value !== "string") {
          etags.set(key, null);
          return null;
        }

        try {
          await local.set(key, payload.value);
        } catch {}

        return { value: payload.value };
      },

      async set(key, value) {
        if (mode === "local") {
          await local.set(key, value);
          return;
        }

        const headers = {
          "content-type": "text/plain; charset=utf-8",
        };

        if (WEEK_KEY_RE.test(key) && etags.has(key)) {
          const etag = etags.get(key);

          if (etag) {
            headers["if-match"] = etag;
          } else {
            headers["if-none-match"] = "*";
          }
        }

        const response = await request(withQuery({ key }), {
          method: "PUT",
          headers,
          body: value,
        });

        if (response === null) {
          await local.set(key, value);
          return;
        }

        if (response.status === 409 || response.status === 412) {
          throw makeError(
            "This week was updated elsewhere before your save finished.",
            "conflict",
          );
        }

        if (!response.ok) {
          throw await buildResponseError(response, "Failed to save shared data.");
        }

        const payload = await readJson(response);

        if (typeof payload?.etag === "string") {
          etags.set(key, payload.etag);
        }

        await local.set(key, value);
      },

      async delete(key) {
        if (mode === "local") {
          await local.delete(key);
          return;
        }

        const response = await request(withQuery({ key }), { method: "DELETE" });

        if (response === null) {
          await local.delete(key);
          return;
        }

        if (!response.ok && response.status !== 404) {
          throw await buildResponseError(response, "Failed to delete shared data.");
        }

        etags.delete(key);
        await local.delete(key);
      },

      async list(prefix) {
        if (mode === "local") {
          return local.list(prefix);
        }

        const response = await request(withQuery({ list: "1", prefix: prefix || "" }), {
          method: "GET",
        });

        if (response === null) {
          return local.list(prefix);
        }

        if (!response.ok) {
          throw await buildResponseError(response, "Failed to list shared data.");
        }

        const payload = await readJson(response);
        return {
          keys: Array.isArray(payload?.keys) ? payload.keys : [],
        };
      },
    };
  }

  if (!window.onnDefaultStorageBackend) {
    window.onnDefaultStorageBackend = createAutoNetlifyBackend();
  }
})();
