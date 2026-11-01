"use strict";

const ExposureBaseAssets = (() => {
  const MAX_BYTES = 30 * 1024 * 1024;
  const MAX_CATALOG_BYTES = 1024 * 1024;
  const cached = new Map();
  const pending = new Map();
  let catalogPromise = null;

  function describe(base) {
    const prefix = "assets/base-photos/";
    if (!base || typeof base.path !== "string" || !base.path.startsWith(prefix)) {
      throw new Error("The base photograph's location is invalid.");
    }
    const name = base.path.slice(prefix.length);
    if (!name || name === "." || name === ".." || /[/\\\u0000-\u001f\u007f]/.test(name) || base.name !== name ||
        typeof base.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(base.sha256) ||
        typeof base.mimeType !== "string" || !/^image\/(jpeg|png|webp|avif)$/.test(base.mimeType) ||
        !Number.isSafeInteger(base.byteLength) || base.byteLength < 1 || base.byteLength > MAX_BYTES || base.base64 !== undefined) {
      throw new Error("The base photograph's details are invalid.");
    }
    const url = new URL(prefix + encodeURIComponent(name), document.baseURI);
    if (url.origin !== window.location.origin) throw new Error("The base photograph must come from this website.");
    url.searchParams.set("v", base.sha256);
    return { name, url, key: `${url.origin}:${base.sha256}:${base.mimeType}:${base.byteLength}` };
  }

  async function download(base, url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url.href, {
        credentials: "same-origin", redirect: "error", cache: "force-cache", signal: controller.signal
      });
      if (!response.ok) throw new Error("The base photograph could not be loaded. Please retry.");
      const declared = response.headers.get("content-length");
      if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) !== base.byteLength)) {
        controller.abort();
        throw new Error("The base photograph has changed. Please reload the page.");
      }
      let bytes;
      if (response.body?.getReader) {
        const reader = response.body.getReader();
        const chunks = [];
        let length = 0;
        try {
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            length += next.value.byteLength;
            if (length > base.byteLength) {
              controller.abort();
              await reader.cancel();
              throw new Error("The base photograph has changed. Please reload the page.");
            }
            chunks.push(next.value);
          }
        } finally { reader.releaseLock(); }
        bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      } else bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength !== base.byteLength) throw new Error("The base photograph could not be downloaded completely. Please retry.");
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      if (hash !== base.sha256) throw new Error("The base photograph does not match the saved version. Please reload the page.");
      return new Blob([bytes], { type: base.mimeType });
    } catch (error) {
      if (controller.signal.aborted && error.name === "AbortError") {
        throw new Error("Loading the base photograph took too long. Please retry.");
      }
      throw error;
    } finally { clearTimeout(timer); }
  }

  async function loadFile(base, { timeoutMs = 120000 } = {}) {
    const { name, url, key } = describe(base);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("The photograph loading timeout is invalid.");
    let blob = cached.get(key);
    if (blob) {
      cached.delete(key);
      cached.set(key, blob);
    } else {
      if (!pending.has(key)) {
        const request = download(base, url, timeoutMs).then(result => {
          cached.set(key, result);
          while (cached.size > 2) cached.delete(cached.keys().next().value);
          return result;
        }).finally(() => pending.delete(key));
        pending.set(key, request);
      }
      blob = await pending.get(key);
    }
    return new File([blob], name, { type: base.mimeType });
  }

  async function readCatalog() {
    const url = new URL("assets/base-photos.json", document.baseURI);
    if (url.origin !== window.location.origin) throw new Error("The photograph catalog must come from this website.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      const response = await fetch(url.href, { credentials: "same-origin", redirect: "error",
        cache: "no-cache", signal: controller.signal });
      if (!response.ok) throw new Error("The website photograph catalog could not be loaded. Please retry.");
      const declared = response.headers.get("content-length");
      if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_CATALOG_BYTES)) {
        controller.abort();
        throw new Error("The website photograph catalog exceeds its size limit.");
      }
      let bytes;
      if (response.body?.getReader) {
        const reader = response.body.getReader();
        const chunks = [];
        let length = 0;
        try {
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            length += next.value.byteLength;
            if (length > MAX_CATALOG_BYTES) {
              controller.abort();
              await reader.cancel();
              throw new Error("The website photograph catalog exceeds its size limit.");
            }
            chunks.push(next.value);
          }
        } finally { reader.releaseLock(); }
        bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      } else bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_CATALOG_BYTES) throw new Error("The website photograph catalog exceeds its size limit.");
      let catalog;
      try { catalog = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
      catch { throw new Error("The website photograph catalog is invalid. Please reload the page."); }
      if (catalog?.version !== 1 || !Array.isArray(catalog.photos) || !catalog.photos.length) {
        throw new Error("The website photograph catalog is invalid. Please reload the page.");
      }
      const hashes = new Set(), paths = new Set();
      return Object.freeze(catalog.photos.map(photo => {
        describe(photo);
        if (hashes.has(photo.sha256) || paths.has(photo.path)) {
          throw new Error("The website photograph catalog contains duplicate entries.");
        }
        hashes.add(photo.sha256); paths.add(photo.path);
        return Object.freeze({ path: photo.path, name: photo.name, sha256: photo.sha256,
          mimeType: photo.mimeType, byteLength: photo.byteLength });
      }));
    } catch (error) {
      if (controller.signal.aborted && error.name === "AbortError") {
        throw new Error("Loading the website photograph catalog took too long. Please retry.");
      }
      throw error;
    } finally { clearTimeout(timer); }
  }

  async function chooseBase(originalHash) {
    if (typeof originalHash !== "string" || !/^[0-9a-f]{64}$/.test(originalHash)) {
      throw new Error("The uploaded photograph's fingerprint is invalid.");
    }
    if (!catalogPromise) catalogPromise = readCatalog().catch(error => { catalogPromise = null; throw error; });
    const photos = (await catalogPromise).filter(photo => photo.sha256 !== originalHash);
    if (!photos.length) throw new Error("There is no different website photograph available for this pairing.");
    return Object.freeze({ ...photos[Math.floor(Math.random() * photos.length)] });
  }

  return Object.freeze({ loadFile, chooseBase });
})();
