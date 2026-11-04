"use strict";

(() => {
  if (document.body.dataset.ownerStudio !== "true") return;
  const editor = window.LocalExposureTest;
  const storage = typeof google === "undefined" || !google.script?.run
    ? new GoogleDriveStorage(EXPOSURE_CONFIG) : null;
  const byId = id => document.getElementById(id);
  const ui = { feedback: byId("studio-save-feedback"), status: byId("studio-save-status"),
    error: byId("studio-save-error"), retry: byId("studio-save-retry"), folder: byId("studio-save-folder") };
  const state = { disposed: false, ready: false, connecting: false, running: false,
    active: null, queue: new Map(), candidates: new Map(), saved: new WeakSet(),
    settleTimer: null, retryTimer: null, error: null, connectAttempts: 0, maximum: 0 };
  ui.feedback.hidden = false;
  const folderPattern = /^https:\/\/drive\.google\.com\/drive\/folders\/[A-Za-z0-9_-]+$/;
  const filePattern = /^https:\/\/drive\.google\.com\/file\/d\/[A-Za-z0-9_-]+\/view$/;

  function pending() {
    return Boolean(state.active || state.queue.size || [...state.candidates.values()].some(value => !state.saved.has(value.blob)));
  }
  function updateStatus() {
    if (state.disposed) return;
    ui.status.textContent = pending() ? "Saving to your folder…"
      : state.candidates.size ? "Saved to your folder." : "";
    ui.error.hidden = !state.error;
    ui.error.textContent = state.error ? "The save could not be confirmed. Retry saving." : "";
    ui.retry.hidden = !state.error;
    ui.retry.disabled = state.running || state.connecting;
  }
  function rpc(action, payload) {
    if (storage) return storage.studio(action, payload);
    return new Promise((resolve, reject) => {
      let finished = false;
      const timer = setTimeout(() => finish(false, Object.assign(new Error("Request timed out."), { code: "REQUEST_TIMEOUT" })), 60000);
      function finish(ok, value) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        ok ? resolve(value) : reject(value);
      }
      try {
        google.script.run.withSuccessHandler(response => {
          if (response?.ok === true) finish(true, response.data);
          else finish(false, Object.assign(new Error("The save was not confirmed."), { code: response?.error?.code || "SAVE_NOT_CONFIRMED" }));
        }).withFailureHandler(() => finish(false, Object.assign(new Error("The request failed."), { code: "RPC_FAILURE" })))
          .studioApi({ action, payload });
      } catch {
        finish(false, Object.assign(new Error("The request is unavailable."), { code: "RPC_FAILURE" }));
      }
    });
  }
  function retryable(error) {
    return ["RPC_FAILURE", "REQUEST_TIMEOUT", "ARCHIVE_UNAVAILABLE", "BUSY", "SAVE_NOT_CONFIRMED"].includes(error.code);
  }
  function handleFailure(error, attempts, resume) {
    if (state.disposed) return;
    if (retryable(error) && attempts < 4) {
      state.retryTimer = setTimeout(() => {
        state.retryTimer = null;
        if (!state.disposed) void resume();
      }, 1000 * 2 ** (attempts - 1));
    } else state.error = error;
    updateStatus();
  }
  async function connect() {
    if (state.disposed || state.connecting) return;
    state.connecting = true;
    state.connectAttempts++;
    try {
      const status = await rpc("status", {});
      if (state.disposed) return;
      if (!status || !folderPattern.test(status.folderUrl) || !Number.isSafeInteger(status.maxResultBytes)
          || status.maxResultBytes < 1 || status.maxResultBytes > 12 * 1024 * 1024) {
        throw Object.assign(new Error("The folder could not be verified."), { code: "INVALID_RECEIPT" });
      }
      state.maximum = status.maxResultBytes;
      state.ready = true;
      ui.folder.href = status.folderUrl;
      ui.folder.hidden = false;
    } catch (error) {
      handleFailure(error, state.connectAttempts, connect);
    } finally {
      state.connecting = false;
      updateStatus();
      if (state.ready) void saveNext();
    }
  }
  async function prepare(snapshot) {
    const { blob, filename, width, height, program } = snapshot;
    if (blob.type !== "image/jpeg" || blob.size < 1 || blob.size > state.maximum) {
      throw Object.assign(new Error("The JPEG cannot be saved."), { code: "INVALID_IMAGE" });
    }
    const bytes = await blob.arrayBuffer();
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map(value => value.toString(16).padStart(2, "0")).join("");
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(reader.result);
        match ? resolve(match[1]) : reject(Object.assign(new Error("The JPEG could not be read."), { code: "INVALID_IMAGE" }));
      };
      reader.onerror = () => reject(Object.assign(new Error("The JPEG could not be read."), { code: "INVALID_IMAGE" }));
      reader.readAsDataURL(blob);
    });
    return { hash, payload: { program, image: { name: filename, mimeType: "image/jpeg", base64 }, width, height } };
  }
  async function saveNext() {
    if (state.disposed || !state.ready || state.running || state.error || state.retryTimer !== null) return;
    if (!state.active) {
      const next = state.queue.entries().next().value;
      if (!next) return updateStatus();
      state.queue.delete(next[0]);
      state.active = { snapshot: next[1], attempts: 0, prepared: null };
    }
    const job = state.active;
    state.running = true;
    job.attempts++;
    updateStatus();
    try {
      if (!job.prepared) job.prepared = await prepare(job.snapshot);
      if (state.disposed) return;
      const receipt = await rpc("save", job.prepared.payload);
      if (state.disposed) return;
      if (!receipt || receipt.saved !== true || receipt.sha256 !== job.prepared.hash
          || receipt.byteLength !== job.snapshot.blob.size || receipt.width !== job.snapshot.width
          || receipt.height !== job.snapshot.height || !filePattern.test(receipt.fileUrl)
          || receipt.folderUrl !== ui.folder.href) {
        throw Object.assign(new Error("The saved JPEG could not be verified."), { code: "SAVE_NOT_CONFIRMED" });
      }
      state.saved.add(job.snapshot.blob);
      state.active = null;
    } catch (error) {
      handleFailure(error, job.attempts, saveNext);
    } finally {
      state.running = false;
      updateStatus();
      if (!state.active) void saveNext();
    }
  }
  function captureOutputs() {
    if (state.disposed) return;
    if (state.settleTimer !== null) clearTimeout(state.settleTimer);
    state.settleTimer = null;
    state.candidates.clear();
    for (const kind of ["reference", "trial"]) {
      const snapshot = editor.snapshot(kind);
      if (snapshot) state.candidates.set(kind, snapshot);
    }
    if ([...state.candidates.values()].some(snapshot => !state.saved.has(snapshot.blob))) {
      state.settleTimer = setTimeout(() => {
        state.settleTimer = null;
        for (const [kind, snapshot] of state.candidates) {
          if (!state.saved.has(snapshot.blob) && state.active?.snapshot.blob !== snapshot.blob) state.queue.set(kind, snapshot);
        }
        void saveNext();
      }, 800);
    }
    updateStatus();
  }
  ui.retry.addEventListener("click", () => {
    if (state.running || state.connecting || state.disposed) return;
    state.error = null;
    if (state.active) state.active.attempts = 0;
    if (state.ready) void saveNext();
    else { state.connectAttempts = 0; void connect(); }
    updateStatus();
  });
  const unsubscribe = editor.subscribe(captureOutputs);
  window.addEventListener("beforeunload", event => {
    if (pending()) { event.preventDefault(); event.returnValue = ""; }
  });
  window.addEventListener("pagehide", event => {
    if (event.persisted) return;
    state.disposed = true;
    unsubscribe();
    if (state.settleTimer !== null) clearTimeout(state.settleTimer);
    if (state.retryTimer !== null) clearTimeout(state.retryTimer);
    state.candidates.clear();
    state.queue.clear();
    state.active = null;
    storage?.dispose();
  });
  void connect();
})();
