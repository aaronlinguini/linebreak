/* Owner-only import page served by Google Apps Script. Authorization is enforced there. */
(() => {
  "use strict";
  if (typeof document === "undefined" || !document.getElementById("artist-workspace")) return;
  const byId = (id) => document.getElementById(id);
  const ui = {
    workspace: byId("artist-workspace"), form: byId("artist-import-form"),
    input: byId("artist-photo-input"), submit: byId("artist-import-button"),
    refresh: byId("artist-refresh-button"), summary: byId("artist-summary"),
    count: byId("artist-count"), status: byId("artist-status"),
    error: byId("artist-error"), results: byId("artist-results"), folders: byId("artist-folders")
  };
  const MAX_BYTES = 30 * 1024 * 1024;
  const REQUEST_TIMEOUT = 120000;
  const readers = new Set();
  let ready = false, working = false, disposed = false, maxBytes = MAX_BYTES;

  function refreshControls() {
    ui.workspace.setAttribute("aria-busy", String(working));
    ui.input.disabled = working || !ready;
    ui.submit.disabled = working || !ready || !ui.input.files?.length;
    ui.refresh.disabled = working;
  }
  function clearError() { ui.error.hidden = true; ui.error.textContent = ""; }
  function showError(error) {
    ui.error.textContent = error?.message || "The collection could not finish this request.";
    ui.error.hidden = false;
  }
  function setCount(value) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("The collection returned an invalid photograph count.");
    ui.count.textContent = String(value);
    ui.summary.hidden = false;
  }
  function showFolders(folders = {}) {
    let visible = false;
    for (const name of ["root", "artist", "originals", "results"]) {
      const link = byId(`artist-folder-${name}`);
      let url;
      try { url = new URL(folders[name]); } catch { /* Missing links remain hidden. */ }
      const valid = url && url.protocol === "https:" && url.hostname === "drive.google.com" && !url.username && !url.password && !url.port && /^\/drive\/(?:u\/\d+\/)?folders\/[A-Za-z0-9_-]+$/.test(url.pathname);
      link.hidden = !valid;
      if (valid) { link.href = url.href; visible = true; }
    }
    ui.folders.hidden = !visible;
  }

  function request(action, payload = {}) {
    return new Promise((resolve, reject) => {
      if (typeof google === "undefined" || !google.script?.run) {
        reject(new Error("Open this page through your deployed Google Apps Script project."));
        return;
      }
      let settled = false;
      const timer = setTimeout(() => finish(new Error(action === "import"
        ? "Import confirmation timed out. The photograph may already be saved; importing the same file again will not create another copy."
        : "The collection did not respond. Use Check collection to try again.")), REQUEST_TIMEOUT);
      function finish(error, value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error); else resolve(value);
      }
      try {
        google.script.run
          .withSuccessHandler((response) => {
            if (!response || response.ok !== true || !response.data || typeof response.data !== "object") {
              finish(new Error(response?.error?.message || "The collection returned an unreadable response."));
            } else finish(null, response.data);
          })
          .withFailureHandler((error) => finish(new Error(error?.message || "The collection request failed.")))
          .artistApi({ action, payload });
      } catch (error) { finish(error); }
    });
  }

  function imageType(file) {
    const types = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif" };
    const type = file.type || types[String(file.name).split(".").pop().toLowerCase()];
    if (!Object.values(types).includes(type)) throw new Error("Choose JPEG, PNG, WebP or AVIF. Export HEIC or RAW photographs first.");
    if (!Number.isFinite(file.size) || file.size < 1 || file.size > maxBytes) throw new Error(`Choose a photograph up to ${Math.floor(maxBytes / 1024 / 1024)} MB.`);
    return type;
  }
  function readImage(file) {
    const mimeType = imageType(file);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      readers.add(reader);
      function finish(error, value) {
        readers.delete(reader);
        reader.onload = reader.onerror = reader.onabort = null;
        if (error) reject(error); else resolve(value);
      }
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        const comma = result.indexOf(",");
        const base64 = comma < 0 ? "" : result.slice(comma + 1);
        if (!base64 || !/^data:[^,]*;base64,/i.test(result)) finish(new Error("The photograph could not be read."));
        else finish(null, { name: file.name, mimeType, base64 });
      };
      reader.onerror = () => finish(new Error("The photograph could not be read. Select it again and retry."));
      reader.onabort = () => finish(new Error("The photograph import was cancelled."));
      try { reader.readAsDataURL(file); } catch (error) { finish(error); }
    });
  }

  async function checkCollection() {
    if (working || disposed) return;
    working = true;
    clearError();
    refreshControls();
    ui.status.textContent = "Checking the collection…";
    try {
      const response = await request(ready ? "refresh" : "status");
      if (disposed) return;
      setCount(response.artistCount);
      if (response.maxOriginalBytes !== undefined) {
        if (!Number.isSafeInteger(response.maxOriginalBytes) || response.maxOriginalBytes < 1) throw new Error("The collection returned an invalid file size limit.");
        maxBytes = Math.min(MAX_BYTES, response.maxOriginalBytes);
      }
      if (response.folders) showFolders(response.folders);
      ready = true;
      ui.status.textContent = "Collection ready.";
    } catch (error) {
      if (!disposed) { showError(error); ui.status.textContent = "Collection unavailable. Use Check collection to retry."; }
    } finally {
      working = false;
      if (!disposed) refreshControls();
    }
  }

  async function importPhotographs(event) {
    event.preventDefault();
    if (!ready || working || disposed || !ui.input.files?.length) return;
    const files = Array.from(ui.input.files);
    working = true;
    clearError();
    ui.results.replaceChildren();
    ui.results.hidden = false;
    refreshControls();
    let imported = 0, duplicates = 0, failed = 0;
    for (let index = 0; index < files.length && !disposed; index++) {
      const file = files[index];
      const item = document.createElement("li");
      item.textContent = `${file.name}: importing…`;
      ui.results.append(item);
      ui.status.textContent = `Importing ${index + 1} of ${files.length}…`;
      try {
        const image = await readImage(file);
        if (disposed) return;
        const response = await request("import", { image });
        if (disposed) return;
        if (typeof response.imported !== "boolean" || typeof response.duplicate !== "boolean" || response.imported === response.duplicate) throw new Error("The collection returned an unreadable import result. Check the collection before retrying.");
        setCount(response.artistCount);
        if (response.duplicate) { duplicates++; item.textContent = `${file.name}: already in the collection.`; }
        else { imported++; item.textContent = `${file.name}: imported.`; }
      } catch (error) {
        if (disposed) return;
        failed++;
        item.className = "import-error";
        item.textContent = `${file.name}: ${error?.message || "Import could not be confirmed. Retry this photograph."}`;
      }
    }
    working = false;
    if (disposed) return;
    ui.status.textContent = `${imported} imported · ${duplicates} already present · ${failed} not confirmed.`;
    if (failed === 0) ui.input.value = "";
    refreshControls();
  }

  ui.form.addEventListener("submit", importPhotographs);
  ui.input.addEventListener("change", () => {
    if (working || disposed) return;
    clearError();
    ui.status.textContent = ui.input.files?.length ? `${ui.input.files.length} photographs selected.` : "Collection ready.";
    refreshControls();
  });
  ui.refresh.addEventListener("click", checkCollection);
  window.addEventListener("pagehide", () => {
    disposed = true;
    for (const reader of readers) reader.abort();
  }, { once: true });
  void checkCollection();
})();
