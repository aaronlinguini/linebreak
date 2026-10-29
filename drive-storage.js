/* Google Apps Script transport. Photo processing remains in scripts.js. */
(() => {
  "use strict";

  const PROTOCOL = "double-exposure-archive-v1";

  function storageError(code, message, details = {}) {
    const error = new Error(message);
    error.name = "DriveStorageError";
    error.code = code;
    Object.assign(error, details);
    return error;
  }

  function endpoint(value) {
    if (!value || typeof value !== "string") return null;
    let url;
    try {
      url = new URL(value);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" || url.hostname !== "script.google.com" ||
        url.port || url.username || url.password ||
        !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)) return null;
    url.search = "";
    url.hash = "";
    return url;
  }

  function googleOrigin(value) {
    try {
      const url = new URL(value);
      return url.origin === value && url.protocol === "https:" && !url.port &&
        (url.hostname === "googleusercontent.com" ||
          url.hostname.endsWith(".googleusercontent.com"));
    } catch {
      return false;
    }
  }

  function timeoutValue(value, fallback) {
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function validSubmissionId(value) {
    return typeof value === "string" && value.length > 0 && value.length <= 128;
  }

  function mimeType(file) {
    if (file.type) return file.type;
    const extension = String(file.name || "").split(".").pop().toLowerCase();
    return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
      webp: "image/webp", avif: "image/avif" })[extension] || "application/octet-stream";
  }

  class GoogleDriveStorage {
    constructor(config = {}) {
      this.config = {
        googleScriptUrl: config.googleScriptUrl || "",
        connectionTimeoutMs: timeoutValue(config.connectionTimeoutMs, 30000),
        requestTimeoutMs: timeoutValue(config.requestTimeoutMs, 120000),
      };
      this._disposed = false;
      this._window = null;
      this._iframe = null;
      this._channel = null;
      this._source = null;
      this._sourceOrigin = null;
      this._listener = null;
      this._handshake = null;
      this._connectPromise = null;
      this._bootstrap = null;
      this._connected = false;
      this._requestSerial = 0;
      this._pending = new Map();
      this._readers = new Set();
    }

    get configured() {
      return endpoint(this.config.googleScriptUrl) !== null;
    }

    connect() {
      if (this._disposed) return Promise.reject(storageError("DISPOSED", "The archive connection is closed."));
      if (this._connectPromise) return this._connectPromise;

      const alreadyOpen = Boolean(this._source);
      this._connectPromise = (alreadyOpen ? Promise.resolve() : this._open())
        .then(async () => {
          const data = await this._request("bootstrap", {});
          this._bootstrap = data;
          this._connected = true;
          return data;
        })
        .catch((error) => {
          if (!alreadyOpen) this._disconnect(error);
          throw error;
        })
        .finally(() => { this._connectPromise = null; });
      return this._connectPromise;
    }

    async begin({ submissionId, originalFile, allowReuse = false, reuse } = {}) {
      this._assertActive();
      if (!validSubmissionId(submissionId) || Boolean(originalFile) === Boolean(reuse) ||
          typeof allowReuse !== "boolean" ||
          (reuse && (!validSubmissionId(reuse.submissionId) || typeof reuse.token !== "string" || !reuse.token))) {
        throw storageError("INVALID_SUBMISSION", "A submission ID and one original photograph or saved exposure are required.");
      }
      if (!this._connected) await this.connect();
      if (reuse) return this._request("begin", { submissionId, reuse });
      const base64 = await this._readBase64(originalFile);
      return this._request("begin", { submissionId, allowReuse,
        original: { name: originalFile.name || "photograph", mimeType: mimeType(originalFile), base64 } });
    }

    async complete({ submissionId, token, resultBlob, width, height, settings = {} } = {}) {
      this._assertActive();
      if (!validSubmissionId(submissionId) || typeof token !== "string" || !token || !resultBlob ||
          !Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
        throw storageError("INVALID_SUBMISSION", "The finished exposure and its submission details are required.");
      }
      if (!this._connected) await this.connect();
      const base64 = await this._readBase64(resultBlob);
      return this._request("complete", {
        submissionId, token,
        result: { name: `${submissionId}.jpg`, mimeType: "image/jpeg", base64 },
        width, height, settings,
      });
    }

    dispose() {
      if (this._disposed) return;
      this._disposed = true;
      const error = storageError("DISPOSED", "The archive connection is closed.");
      for (const reader of [...this._readers]) reader.cancel(error);
      this._disconnect(error);
    }

    _assertActive() {
      if (this._disposed) throw storageError("DISPOSED", "The archive connection is closed.");
    }

    _open() {
      return new Promise((resolve, reject) => {
        this._assertActive();
        const url = endpoint(this.config.googleScriptUrl);
        if (!url) {
          reject(storageError(this.config.googleScriptUrl ? "INVALID_ENDPOINT" : "ARCHIVE_NOT_CONFIGURED",
            "Configure a Google Apps Script deployment URL ending in /exec."));
          return;
        }
        if (typeof window === "undefined" || typeof document === "undefined" || !document.body) {
          reject(storageError("BROWSER_REQUIRED", "The archive connection requires a browser page."));
          return;
        }
        const origin = window.location.origin;
        let parentUrl;
        try { parentUrl = new URL(origin); } catch { /* file: pages have no usable origin. */ }
        if (!parentUrl || !["https:", "http:"].includes(parentUrl.protocol) || parentUrl.origin !== origin) {
          reject(storageError("INVALID_ORIGIN", "Open this website over HTTP or HTTPS to connect to the archive."));
          return;
        }
        if (!window.crypto || typeof window.crypto.getRandomValues !== "function") {
          reject(storageError("SECURE_RANDOM_REQUIRED", "The browser cannot create a secure archive connection."));
          return;
        }

        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        this._window = window;
        this._channel = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
        url.searchParams.set("origin", origin);
        url.searchParams.set("channel", this._channel);

        this._handshake = {
          resolve,
          reject,
          timer: setTimeout(() => {
            reject(storageError("CONNECTION_TIMEOUT", "The archive did not connect. Check the deployment and allowed site origin."));
          }, this.config.connectionTimeoutMs),
        };
        this._listener = (event) => this._receive(event);
        // Register before loading the iframe: its first ready message may arrive immediately.
        window.addEventListener("message", this._listener);
        const iframe = document.createElement("iframe");
        iframe.className = "storage-bridge";
        iframe.title = "Project archive connection";
        iframe.hidden = true;
        iframe.src = url.href;
        this._iframe = iframe;
        try {
          document.body.appendChild(iframe);
        } catch (error) {
          reject(storageError("CONNECTION_FAILED", error.message || "The archive frame could not be opened."));
        }
      });
    }

    _receive(event) {
      if (this._disposed) return;
      const message = event.data;
      if (!message || typeof message !== "object" || message.protocol !== PROTOCOL ||
          message.channel !== this._channel) return;

      if (message.type === "ready") {
        if (!googleOrigin(event.origin) || !event.source || event.source === this._window) return;
        if (this._source && (event.source !== this._source || event.origin !== this._sourceOrigin)) return;
        if (!this._handshake && !this._source) return;
        this._source = event.source;
        this._sourceOrigin = event.origin;
        try {
          this._source.postMessage({ protocol: PROTOCOL, channel: this._channel, type: "ack" }, this._sourceOrigin);
        } catch {
          if (this._handshake) this._handshake.reject(storageError("CONNECTION_FAILED", "The archive frame could not be reached."));
          return;
        }
        if (this._handshake) {
          clearTimeout(this._handshake.timer);
          const { resolve } = this._handshake;
          this._handshake = null;
          resolve();
        }
        return;
      }

      if (message.type !== "response" || event.source !== this._source ||
          event.origin !== this._sourceOrigin || typeof message.id !== "string") return;
      const pending = this._pending.get(message.id);
      if (!pending) return;
      this._pending.delete(message.id);
      clearTimeout(pending.timer);
      const response = message.response;
      if (!response || typeof response !== "object" || typeof response.ok !== "boolean") {
        pending.reject(storageError("INVALID_RESPONSE", "The archive returned an unreadable response."));
      } else if (response.ok) {
        pending.resolve(response.data);
      } else {
        const detail = response.error || {};
        const extra = typeof detail.originalSaved === "boolean" ? { originalSaved: detail.originalSaved } : {};
        pending.reject(storageError(typeof detail.code === "string" ? detail.code : "ARCHIVE_ERROR",
          typeof detail.message === "string" ? detail.message : "The archive could not finish this request.", extra));
      }
    }

    _request(action, payload) {
      this._assertActive();
      if (!this._source) return Promise.reject(storageError("NOT_CONNECTED", "The archive is not connected."));
      const id = `${this._channel}.${++this._requestSerial}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this._pending.delete(id);
          // Never replay uploads automatically: the server may have saved them already.
          const error = storageError("REQUEST_TIMEOUT", "The archive did not respond in time. The request may have completed; retry the same submission.", { ambiguous: true, action });
          // A reloaded iframe can retain its old WindowProxy while losing the bridge.
          // Drop it so a deliberate retry establishes a fresh authenticated handshake.
          this._disconnect(error);
          reject(error);
        }, this.config.requestTimeoutMs);
        this._pending.set(id, { resolve, reject, timer, action });
        try {
          this._source.postMessage({ protocol: PROTOCOL, channel: this._channel,
            type: "request", id, request: { action, payload } }, this._sourceOrigin);
        } catch {
          clearTimeout(timer);
          this._pending.delete(id);
          const error = storageError("SEND_FAILED", "The request could not be sent to the archive.", { action });
          this._disconnect(error);
          reject(error);
        }
      });
    }

    _readBase64(blob) {
      this._assertActive();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        let done = false;
        let timer;
        const finish = (error, value) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          this._readers.delete(job);
          reader.onload = reader.onerror = reader.onabort = null;
          if (error) reject(error); else resolve(value);
        };
        const job = { cancel: (error) => {
          finish(error);
          try { reader.abort(); } catch { /* It may have finished already. */ }
        } };
        this._readers.add(job);
        reader.onload = () => {
          const match = typeof reader.result === "string" && /^data:[^,]*;base64,([A-Za-z0-9+/]*={0,2})$/.exec(reader.result);
          if (!match) finish(storageError("FILE_READ_FAILED", "The photograph could not be read."));
          else finish(null, match[1]);
        };
        reader.onerror = () => finish(storageError("FILE_READ_FAILED", "The photograph could not be read."));
        reader.onabort = () => finish(storageError("FILE_READ_ABORTED", "Reading the photograph was cancelled."));
        timer = setTimeout(() => job.cancel(storageError("FILE_READ_TIMEOUT", "Reading the photograph took too long.")), this.config.requestTimeoutMs);
        try { reader.readAsDataURL(blob); }
        catch { finish(storageError("FILE_READ_FAILED", "The photograph could not be read.")); }
      });
    }

    _disconnect(error) {
      this._connected = false;
      this._bootstrap = null;
      if (this._handshake) {
        clearTimeout(this._handshake.timer);
        this._handshake.reject(error);
        this._handshake = null;
      }
      for (const pending of this._pending.values()) {
        clearTimeout(pending.timer);
        if (error.code === "REQUEST_TIMEOUT" || error.code === "SEND_FAILED") {
          pending.reject(storageError(error.code,
            "The archive connection was lost. The request may have completed; retry the same submission.",
            { ambiguous: true, action: pending.action }));
        } else {
          pending.reject(error);
        }
      }
      this._pending.clear();
      if (this._window && this._listener) this._window.removeEventListener("message", this._listener);
      if (this._iframe) this._iframe.remove();
      this._iframe = this._listener = this._source = this._sourceOrigin = this._channel = null;
    }
  }

  globalThis.GoogleDriveStorage = GoogleDriveStorage;
})();
