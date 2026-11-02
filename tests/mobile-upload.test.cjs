"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { File } = require("node:buffer");
const { webcrypto, createHash } = require("node:crypto");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts.js"), "utf8");
const toolHtml = fs.readFileSync(path.join(root, "double-exposure.html"), "utf8");
const flush = () => new Promise((resolve) => setImmediate(resolve));
const makeFile = () => new File([Uint8Array.from([1, 2, 3])], "phone.jpg", { type: "image/jpeg" });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const developingMessage = toolHtml.match(/<p\b[^>]*id="busy-indicator"[^>]*>([^<]+)<\/p>/)[1].trim();

function harness({ configured = true, canRePair = true, forceBlackAndWhite = false, supportsCapture = false, assets,
  digest = (...args) => webcrypto.subtle.digest(...args),
  realWorkflow = false, storage: storageImpl = {},
  connect = async () => ({ totalEligible: 2 }) } = {}) {
  const ids = ["workspace", "canvas", "result-empty", "source-actions", "result-actions", "repeat-actions", "allow-reuse", "decline-reuse",
    "new-pairing-button", "reset-button", "participant-input", "participant-camera-input",
    "upload-label", "camera-label", "download-button", "rotate-button", "retry-button", "status", "error",
    "busy-indicator", "exposure-controls", "upload-instructions", "output-options", "visitor-monochrome", "visitor-colour",
    "camera-picker", "camera-separator", "camera-instructions", "picker-singular", "picker-plural",
    "upload-again-note"];
  const handlers = new Map();
  const windowHandlers = new Map();
  const elements = new Map(ids.map((id) => [id, {
    hidden: true, disabled: false, checked: false, files: [], value: "", textContent: "",
    attributes: {}, classList: { toggle() {} },
    setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute(name) { delete this.attributes[name]; },
    getContext() { return { drawImage() {} }; },
    addEventListener(type, fn) { handlers.set(id + ":" + type, fn); }
  }]));
  const calls = { start: [], connect: 0, rePair: 0, rePairRequests: [], retry: 0, changeMonochrome: [], modeRequests: [],
    load: [], develop: [], assetLoads: [], rotate: 0, downloads: [], revoked: [], draws: [], released: [],
    begin: [], complete: [], dispose: 0 };
  const timers = new Map();
  let now = 0;
  let timerId = 0;
  if (supportsCapture) elements.get("participant-camera-input").capture = "environment";
  elements.get("busy-indicator").textContent = developingMessage;
  elements.get("upload-again-note").textContent = toolHtml.match(/<p\b[^>]*id="upload-again-note"[^>]*>([^<]*)<\/p>/)[1].trim();
  elements.get("new-pairing-button").textContent = toolHtml.match(/<button\b[^>]*id="new-pairing-button"[^>]*>([^<]+)<\/button>/)[1].trim();
  elements.get("canvas").getContext = () => ({ drawImage(canvas) { calls.draws.push(canvas); } });
  const urls = new Map();
  let rotationGate;
  let rotationError;
  let startGate;
  let startError;
  const startReady = deferred();
  let photoGate;
  let rePairGate;
  let rePairError;
  let retryGate;
  let monochromeGate;
  let monochromeError;
  let developmentGate;
  let connectImpl = connect;
  let mounted = false;
  let workflow;
  let defaultSettings;
  const baseFor = (id) => ({ id, name: `${id}.jpg`, mimeType: "image/jpeg", base64: "AQID",
    sha256: (id === "first-base" ? "a" : "b").repeat(64), byteLength: 3 });
  const sandbox = vm.createContext({
    Error, File, atob, crypto: { subtle: { digest }, randomUUID: () => webcrypto.randomUUID() },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, at: now + delay, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    document: {
      getElementById(id) { return mounted ? elements.get(id) : null; },
      createElement(tag) { return tag === "canvas" ? { width: 0, height: 0 } : {
        click() { calls.downloads.push({ href: this.href, filename: this.download }); }, remove() {}
      }; },
      body: { append() {} }
    },
    window: { addEventListener(type, handler) { windowHandlers.set(type, handler); } },
    URL: {
      createObjectURL(blob) { const url = `blob:result-${urls.size + 1}`; urls.set(url, blob); return url; },
      revokeObjectURL(url) { calls.revoked.push(url); }
    },
    EXPOSURE_CONFIG: { forceBlackAndWhite },
    GoogleDriveStorage: class {
      configured = configured;
      async connect() { calls.connect++; return connectImpl(); }
      async begin(request) { calls.begin.push(request); return storageImpl.begin(request); }
      async complete(request) { calls.complete.push(request); return storageImpl.complete(request); }
      dispose() { calls.dispose++; }
    },
    ExposureArchiveWorkflow: class {
      pending = false;
      operation = null;
      constructor(options) {
        workflow = this; defaultSettings = options.settings;
        this.onProgress = options.onProgress;
      }
      async start(file, choice) {
        calls.start.push({ file, choice, workflow: this });
        this.pending = true;
        const base = choice.previewBase || baseFor("first-base");
        this.operation = { submissionId: "first", file, allowReuse: choice.allowReuse,
          settings: { ...defaultSettings, monochrome: choice.monochrome }, base,
          previewBase: choice.previewBase || null, begin: { base, token: "first-token" },
          result: { blob: { type: "image/jpeg", size: 10, monochrome: choice.monochrome }, width: 600, height: 400, preparedCanvas: {} },
          receipt: null };
        startReady.resolve(this.operation);
        if (startGate) await startGate;
        if (startError) throw startError;
        this.operation.receipt = { canRePair };
        this.pending = false;
        return this.operation;
      }
      async rePair({ monochrome = this.operation.settings.monochrome } = {}) {
        calls.rePair++;
        calls.rePairRequests.push({ monochrome });
        this.pending = true;
        const base = baseFor("second-base");
        this.operation = { submissionId: "second", settings: { ...this.operation.settings, monochrome }, base,
          begin: { base, token: "second-token" },
          result: { blob: { type: "image/jpeg", size: 10, monochrome }, width: 800, height: 600, preparedCanvas: {} },
          receipt: null };
        if (rePairGate) await rePairGate;
        if (rePairError) throw rePairError;
        this.operation.receipt = { canRePair: false };
        this.pending = false;
        return this.operation;
      }
      async changeMonochrome(monochrome, { result, base = this.operation.begin.base } = {}) {
        calls.changeMonochrome.push(monochrome);
        calls.modeRequests.push({ monochrome, result, base });
        this.pending = true;
        this.operation = { submissionId: `mode-${calls.changeMonochrome.length}`, base, begin: { base, token: "mode-token" },
          settings: { ...this.operation.settings, monochrome },
          result: result || { blob: { type: "image/jpeg", size: 10, monochrome }, width: 600, height: 400, preparedCanvas: {} },
          receipt: null };
        if (monochromeGate) await monochromeGate;
        if (monochromeError) throw monochromeError;
        this.operation.receipt = { canRePair };
        this.pending = false;
        return this.operation;
      }
      async retry() {
        calls.retry++;
        if (retryGate) await retryGate;
        this.operation.receipt = { canRePair };
        this.pending = false;
        return this.operation;
      }
    }
  });
  if (realWorkflow) {
    const archiveSource = fs.readFileSync(path.join(root, "archive-workflow.js"), "utf8");
    const ActualWorkflow = vm.runInContext(`(() => { ${archiveSource}; return ExposureArchiveWorkflow; })()`, sandbox);
    sandbox.ExposureArchiveWorkflow = class extends ActualWorkflow {
      constructor(options) {
        const preview = deferred();
        super({ ...options, onProgress: (event) => {
          options.onProgress(event);
          if (event.stage === "preview") preview.resolve(this.operation);
        } });
        workflow = this;
        this.previewReady = preview.promise;
      }
      start(file, choice) {
        calls.start.push({ file, choice, workflow: this });
        const result = super.start(file, choice);
        startReady.resolve(this.operation);
        return result;
      }
      retry() { calls.retry++; return super.retry(); }
      changeMonochrome(monochrome, options) {
        calls.changeMonochrome.push(monochrome);
        calls.modeRequests.push({ monochrome, ...options });
        return super.changeMonochrome(monochrome, options);
      }
    };
  }
  if (assets) sandbox.ExposureBaseAssets = {
    async loadFile(base) { calls.assetLoads.push(base); return new File([Uint8Array.from([1, 2, 3])], base.name, { type: base.mimeType }); },
    ...assets
  };
  vm.runInContext(source, sandbox);
  sandbox.createExposureProcessor = () => ({
    async loadPhoto(file) {
      calls.load.push(file);
      if (photoGate) await photoGate;
      if (file.type !== "image/jpeg") throw new Error("Unsupported photograph.");
      return { name: file.name, width: 600, height: 400, thumbnail: "data:image/jpeg;base64,AA==" };
    },
    releasePhoto(photo) { if (photo) calls.released.push(photo); },
    async develop(base, participant, canvas, settings) {
      const result = { blob: { type: "image/jpeg", size: 10, monochrome: settings.monochrome }, width: 600, height: 400 };
      calls.develop.push({ base, participant, canvas, settings, result });
      if (developmentGate) await developmentGate;
      canvas.width = result.width;
      canvas.height = result.height;
      return result;
    }
  });
  sandbox.rotateExposureCanvas = async (canvas) => {
    calls.rotate++;
    if (rotationGate) await rotationGate;
    if (rotationError) throw rotationError;
    [canvas.width, canvas.height] = [canvas.height, canvas.width];
    return { blob: { rotated: calls.rotate }, width: canvas.width, height: canvas.height };
  };
  mounted = true;
  sandbox.initializeExposureStudio();
  return {
    elements, calls, urls, timers, startReady: startReady.promise, get workflow() { return workflow; },
    async advanceTime(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at > now || !timers.has(id)) continue;
        timers.delete(id);
        timer.callback();
      }
      await flush();
    },
    blockRotation(gate) { rotationGate = gate; },
    failRotation(error) { rotationError = error; },
    blockStart(gate) { startGate = gate; },
    failStart(error) { startError = error; },
    blockPhoto(gate) { photoGate = gate; },
    blockRePair(gate) { rePairGate = gate; },
    failRePair(error) { rePairError = error; },
    blockRetry(gate) { retryGate = gate; },
    blockMonochrome(gate) { monochromeGate = gate; },
    failMonochrome(error) { monochromeError = error; },
    blockDevelopment(gate) { developmentGate = gate; },
    setConnection(connect) { connectImpl = connect; },
    dispatchWindow(type, event) { return windowHandlers.get(type)?.(event); },
    deliverPreview(stage = "archive") { return workflow.onProgress({ stage }); },
    select(id, file) {
      const input = elements.get(id);
      input.files = file ? [file] : [];
      input.value = file ? "fakepath/phone.jpg" : "";
      return handlers.get(id + ":change")();
    },
    click(id) { return handlers.get(id + ":click")(); },
    chooseSharing(allowReuse) {
      elements.get("allow-reuse").checked = allowReuse;
      elements.get("decline-reuse").checked = !allowReuse;
      return handlers.get(`${allowReuse ? "allow-reuse" : "decline-reuse"}:change`)();
    },
    toggleMonochrome(checked) {
      elements.get("visitor-monochrome").checked = checked;
      elements.get("visitor-colour").checked = !checked;
      return handlers.get(`${checked ? "visitor-monochrome" : "visitor-colour"}:change`)();
    }
  };
}

function realArchiveHarness({ onBegin, onComplete, connect } = {}) {
  const base = { name: "pinned.jpg", mimeType: "image/jpeg", byteLength: 3,
    path: "assets/base-photos/pinned.jpg", sha256: "a".repeat(64) };
  const beginnings = new Map();
  const h = harness({ realWorkflow: true,
    connect: () => connect ? connect(base) : { totalEligible: 113, previewBase: base },
    assets: { async chooseBase() { return base; } },
    storage: {
      async begin(options) {
        const parent = options.reuse && beginnings.get(options.reuse.submissionId);
        const begin = { submissionId: options.submissionId, token: `token:${options.submissionId}`,
          originalId: parent?.originalId || `original:${options.submissionId}`, base: { ...base, id: "pinned-base" } };
        if (onBegin) await onBegin(options);
        beginnings.set(options.submissionId, begin);
        return begin;
      },
      async complete(options) {
        const begin = beginnings.get(options.submissionId);
        const receipt = { saved: true, submissionId: options.submissionId, originalId: begin.originalId,
          baseId: begin.base.id, resultId: `result:${options.submissionId}`, canRePair: true };
        return onComplete ? onComplete(options, receipt) : receipt;
      }
    }
  });
  return Object.assign(h, { base, beginnings });
}

function assertResultControlsLocked(h, locked) {
  for (const id of ["download-button", "reset-button", "new-pairing-button", "rotate-button", "visitor-monochrome", "visitor-colour"]) {
    assert.equal(h.elements.get(id).disabled, locked, `${id} ${locked ? "waits for every matching receipt" : "unlocks after confirmed saving"}`);
  }
}

test("initial transient archive connections retry with capped backoff without defaulting the sharing answer", async () => {
  let attempts = 0;
  const h = harness({ connect: async () => {
    if (++attempts < 6) throw Object.assign(new Error("The archive did not connect."), { code: "CONNECTION_TIMEOUT" });
    return { totalEligible: 113 };
  } });
  await flush();
  assert.equal(h.elements.get("allow-reuse").checked, false);
  assert.equal(h.elements.get("decline-reuse").checked, false);
  assert.equal(h.elements.get("participant-input").disabled, true);
  for (const delay of [2000, 5000, 15000, 30000, 30000]) {
    assert.deepEqual([...h.timers.values()].map(timer => timer.delay), [delay]);
    assert.equal(h.elements.get("status").textContent, "Please wait…");
    assert.equal(h.elements.get("retry-button").hidden, true);
    await h.advanceTime(delay);
  }
  assert.equal(h.calls.connect, 6);
  assert.equal(h.calls.start.length, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.elements.get("status").textContent, "");
  assert.equal(h.elements.get("retry-button").hidden, true);
  assert.equal(h.elements.get("allow-reuse").checked, false);
  assert.equal(h.elements.get("decline-reuse").checked, false);
});

test("connection retries wait for photo preparation and then start the queued original with its frozen answer", async () => {
  let attempts = 0;
  const h = harness({ connect: async () => {
    if (++attempts === 1) throw Object.assign(new Error("Connection timed out."), { code: "CONNECTION_TIMEOUT" });
    return { totalEligible: 113 };
  } });
  await flush();
  const preparing = deferred();
  const saving = deferred();
  h.blockPhoto(preparing.promise);
  h.blockStart(saving.promise);
  h.chooseSharing(false);
  const file = makeFile();
  const selecting = h.select("participant-input", file);
  await h.advanceTime(2000);
  assert.equal(h.calls.connect, 1, "a connection retry must not overlap active local preparation");
  assert.equal(h.calls.start.length, 0);
  assert.deepEqual([...h.timers.values()].map(timer => timer.delay), [5000]);
  preparing.resolve();
  await selecting;
  assert.equal(h.elements.get("busy-indicator").hidden, false, "queued connection feedback continues through backoff");
  assert.equal(h.elements.get("retry-button").hidden, true);
  await h.advanceTime(5000);
  await h.startReady;
  assert.equal(h.calls.connect, 2);
  assert.equal(h.calls.load.length, 1);
  assert.equal(h.calls.start.length, 1);
  assert.strictEqual(h.calls.start[0].file, file);
  assert.equal(h.calls.start[0].choice.allowReuse, false);
  assert.equal(h.elements.get("decline-reuse").checked, true);
  assertResultControlsLocked(h, true);
  saving.resolve();
  await flush();
  assertResultControlsLocked(h, false);
});

test("choosing a local preview during connection backoff hands retries to the same frozen archive operation", async () => {
  let connections = 0;
  let begins = 0;
  const h = realArchiveHarness({ connect(base) {
    if (++connections === 1) throw Object.assign(new Error("Connection timed out."), { code: "CONNECTION_TIMEOUT" });
    return { totalEligible: 113, previewBase: base };
  }, onBegin() {
    if (++begins === 1) throw Object.assign(new Error("The archive is not connected."), { code: "NOT_CONNECTED" });
  } });
  await flush();
  h.chooseSharing(true);
  assert.equal(h.elements.get("participant-input").disabled, false, "local selection stays available after answering Yes");
  const file = makeFile();
  await h.select("participant-input", file);
  const operation = h.workflow.operation;
  assert.equal(h.elements.get("canvas").hidden, false);
  assert.equal(h.calls.develop.length, 1);
  assert.equal(h.calls.connect, 1);
  assert.equal(h.timers.size, 1, "the save retry replaces the earlier connection retry timer");
  assert.equal(h.elements.get("error").hidden, true);
  await h.advanceTime(2000);
  assert.equal(h.calls.connect, 2);
  assert.equal(h.calls.retry, 1);
  assert.strictEqual(h.workflow.operation, operation);
  assert.ok(operation.receipt);
  assert.equal(h.calls.start.length, 1);
  assert.equal(h.calls.develop.length, 1);
  assert.ok(h.calls.begin.every(call => call.originalFile === file && call.allowReuse === true &&
    call.submissionId === operation.submissionId && call.preferredBaseSha256 === operation.previewBase.sha256));
  assertResultControlsLocked(h, false);
  await h.click("reset-button");
  assert.equal(h.timers.size, 0, "a confirmed save clears the earlier connection failure");
  assert.equal(h.elements.get("status").textContent, "");
  await h.advanceTime(30000);
  assert.equal(h.calls.connect, 2, "resetting a successfully recovered photo needs no extra reconnect");
});

test("permanent initial connection errors remain manual and a connection timer is cancelled on page exit", async () => {
  const permanent = harness({ connect: async () => {
    throw Object.assign(new Error("The archive address is invalid."), { code: "INVALID_ENDPOINT" });
  } });
  await flush();
  assert.equal(permanent.timers.size, 0);
  assert.equal(permanent.elements.get("retry-button").hidden, false);
  await permanent.advanceTime(1000000);
  assert.equal(permanent.calls.connect, 1);
  permanent.setConnection(async () => ({ totalEligible: 113 }));
  await permanent.click("retry-button");
  assert.equal(permanent.calls.connect, 2);
  assert.equal(permanent.elements.get("allow-reuse").checked, false);
  assert.equal(permanent.elements.get("decline-reuse").checked, false);
  let onlineAttempts = 0;
  const online = harness({ connect: async () => {
    if (++onlineAttempts === 1) throw Object.assign(new Error("Connection failed."), { code: "CONNECTION_FAILED" });
    return { totalEligible: 113 };
  } });
  await flush();
  online.chooseSharing(false);
  online.dispatchWindow("online");
  await flush();
  assert.equal(online.calls.connect, 2, "an online event can reconnect immediately without a selected file");
  assert.equal(online.timers.size, 0);
  assert.equal(online.elements.get("decline-reuse").checked, true);
  assert.equal(online.elements.get("participant-input").disabled, false);
  const transient = harness({ connect: async () => {
    throw Object.assign(new Error("Connection failed."), { code: "CONNECTION_FAILED" });
  } });
  await flush();
  assert.equal(transient.timers.size, 1);
  transient.dispatchWindow("pagehide", { persisted: false });
  assert.equal(transient.timers.size, 0);
  assert.equal(transient.calls.dispose, 1);
  await transient.advanceTime(1000000);
  assert.equal(transient.calls.connect, 1);
});

test("all result controls stay locked through original saving and cannot queue a pairing or discard the preview", async () => {
  const beginning = deferred();
  const completing = deferred();
  const completingStarted = deferred();
  const h = realArchiveHarness({ onBegin: () => beginning.promise, onComplete(options, receipt) {
    completingStarted.resolve();
    return completing.promise.then(() => receipt);
  } });
  await flush();
  h.chooseSharing(true);
  const selecting = h.select("participant-input", makeFile());
  await h.workflow.previewReady;
  const operation = h.workflow.operation;
  assert.equal(operation.begin, null, "the preview can appear before Google confirms the original");
  assertResultControlsLocked(h, true);
  assert.equal(h.elements.get("upload-again-note").hidden, false);
  assert.equal(h.elements.get("upload-again-note").textContent,
    toolHtml.match(/<p\b[^>]*id="upload-again-note"[^>]*>([^<]*)<\/p>/)[1].trim());
  assert.match(h.elements.get("upload-again-note").textContent, /Please wait/);
  for (const id of ["download-button", "reset-button", "new-pairing-button", "rotate-button"]) await h.click(id);
  await h.toggleMonochrome(true);
  assert.equal(h.calls.downloads.length, 0);
  assert.equal(h.calls.rotate, 0);
  assert.equal(h.calls.modeRequests.length, 0);
  assert.equal(h.calls.start.length, 1);
  assert.strictEqual(h.workflow.operation, operation);
  assert.equal(h.elements.get("visitor-colour").checked, true);
  assert.equal(h.elements.get("allow-reuse").checked, true);
  beginning.resolve();
  await completingStarted.promise;
  assertResultControlsLocked(h, true);
  completing.resolve();
  await selecting;
  assertResultControlsLocked(h, false);
  assert.equal(h.calls.begin.length, 1, "disabled clicks must not start another pairing after saving");
  assert.equal(h.elements.get("upload-again-note").hidden, true);
  assert.equal(h.elements.get("status").textContent, "");
  await h.click("download-button");
  assert.strictEqual(h.urls.get(h.calls.downloads[0].href), operation.result.blob);
});

test("local colour rendering and its archived JPEG lock every result control until the variant receipt", async () => {
  const rendering = deferred();
  const completing = deferred();
  const completingStarted = deferred();
  let completions = 0;
  const h = realArchiveHarness({ onComplete(options, receipt) {
    if (++completions === 1) return receipt;
    completingStarted.resolve();
    return completing.promise.then(() => receipt);
  } });
  await flush();
  h.chooseSharing(false);
  await h.select("participant-input", makeFile());
  const original = h.workflow.operation;
  h.blockDevelopment(rendering.promise);
  const changing = h.toggleMonochrome(true);
  await flush();
  assertResultControlsLocked(h, true);
  assert.equal(h.calls.modeRequests.length, 0, "the variant archive waits for the local JPEG");
  rendering.resolve();
  await completingStarted.promise;
  const variant = h.workflow.operation;
  assert.ok(original.receipt, "the parent must confirm before creating a variant operation");
  assert.equal(variant.receipt, null);
  assert.strictEqual(variant.result.blob, h.calls.develop[1].result.blob);
  assert.equal(h.calls.begin[1].reuse.sameBase, true);
  assert.equal(h.calls.begin[1].reuse.submissionId, original.submissionId);
  assertResultControlsLocked(h, true);
  await h.toggleMonochrome(false);
  for (const id of ["download-button", "reset-button", "new-pairing-button", "rotate-button"]) await h.click(id);
  assert.equal(h.elements.get("visitor-monochrome").checked, true, "disabled radio events cannot replace the pending visible mode");
  assert.equal(h.calls.downloads.length, 0);
  assert.strictEqual(h.workflow.operation, variant);
  completing.resolve();
  await changing;
  assertResultControlsLocked(h, false);
  assert.equal(h.calls.begin.length, 2);
  assert.equal(h.calls.complete.filter(request => request.resultBlob === variant.result.blob).length, 1);
  await h.toggleMonochrome(false);
  await h.click("download-button");
  assert.strictEqual(h.urls.get(h.calls.downloads.at(-1).href), original.result.blob);
  assert.equal(h.calls.begin.length, 2, "a confirmed cached mode needs no new archive");
});

test("transient save failures retry with capped backoff while all controls stay locked and red errors stay hidden", async () => {
  let attempts = 0;
  const h = realArchiveHarness({ onComplete(options, receipt) {
    if (++attempts < 6) throw Object.assign(new Error("The archive could not finish this request."), { code: "RPC_FAILURE" });
    return receipt;
  } });
  await flush();
  h.chooseSharing(false);
  await h.select("participant-input", makeFile());
  const operation = h.workflow.operation;
  assert.equal(h.elements.get("error").hidden, true);
  assert.equal(h.elements.get("retry-button").hidden, true);
  assert.equal(h.elements.get("status").textContent, "");
  assert.match(h.elements.get("upload-again-note").textContent, /Please wait while your double exposure is being developed/);
  assert.doesNotMatch(h.elements.get("upload-again-note").textContent, /retry|reconnect/i);
  for (const delay of [2000, 5000, 15000, 30000, 30000]) {
    assertResultControlsLocked(h, true);
    assert.deepEqual([...h.timers.values()].map(timer => timer.delay), [delay]);
    await h.advanceTime(delay);
    assert.strictEqual(h.workflow.operation, operation);
  }
  assertResultControlsLocked(h, false);
  assert.equal(h.calls.retry, 5);
  assert.equal(h.calls.complete.length, 6);
  assert.ok(h.calls.complete.every(call => call.submissionId === operation.submissionId &&
    call.token === operation.begin.token && call.resultBlob === operation.result.blob && call.settings === operation.settings));
  assert.equal(h.elements.get("upload-again-note").hidden, true);
  assert.equal(h.elements.get("error").hidden, true);
});

test("a missing archive confirmation retries the same submission and JPEG instead of unlocking early", async () => {
  let attempts = 0;
  const h = realArchiveHarness({ onComplete(options, receipt) {
    return ++attempts === 1 ? { ...receipt, resultId: "" } : receipt;
  } });
  await flush();
  h.chooseSharing(false);
  await h.select("participant-input", makeFile());
  const operation = h.workflow.operation;
  assertResultControlsLocked(h, true);
  assert.equal(operation.receipt, null);
  await h.advanceTime(2000);
  assert.strictEqual(h.workflow.operation, operation);
  assert.equal(h.calls.complete.length, 2);
  assert.strictEqual(h.calls.complete[0].resultBlob, h.calls.complete[1].resultBlob);
  assert.equal(h.calls.complete[0].token, h.calls.complete[1].token);
  assertResultControlsLocked(h, false);
});

test("BRIDGE_UNAVAILABLE reconnects and retries without overlapping an already active retry", async () => {
  const receiptGate = deferred();
  let attempts = 0;
  const h = realArchiveHarness({ onComplete(options, receipt) {
    if (++attempts === 1) throw Object.assign(new Error("The bridge is not ready."), { code: "BRIDGE_UNAVAILABLE" });
    return receiptGate.promise.then(() => receipt);
  } });
  await flush();
  h.chooseSharing(false);
  await h.select("participant-input", makeFile());
  const connects = h.calls.connect;
  await h.advanceTime(2000);
  assert.equal(h.calls.connect, connects + 1);
  assert.equal(h.calls.retry, 1);
  assertResultControlsLocked(h, true);
  assert.equal(h.elements.get("status").textContent, "", "an active retry clears the earlier waiting message");
  h.dispatchWindow("online");
  await h.click("retry-button");
  await h.advanceTime(100000);
  assert.equal(h.calls.retry, 1);
  receiptGate.resolve();
  await flush();
  assertResultControlsLocked(h, false);
});

test("permanent archive errors keep controls locked and offer manual retry without a hot automatic loop", async () => {
  let attempts = 0;
  const h = realArchiveHarness({ onComplete(options, receipt) {
    if (++attempts === 1) throw Object.assign(new Error("This submission could not be verified."), { code: "INVALID_TOKEN" });
    return receipt;
  } });
  await flush();
  h.chooseSharing(false);
  await h.select("participant-input", makeFile());
  const operation = h.workflow.operation;
  assertResultControlsLocked(h, true);
  assert.equal(h.elements.get("error").hidden, false);
  assert.equal(h.elements.get("retry-button").hidden, false);
  assert.equal(h.timers.size, 0);
  await h.advanceTime(1000000);
  assert.equal(h.calls.retry, 0);
  await h.click("retry-button");
  assert.strictEqual(h.workflow.operation, operation);
  assertResultControlsLocked(h, false);
});

test("pending saving warns on exit and pagehide cancels automatic retry and releases the preview", async () => {
  const h = realArchiveHarness({ onComplete() {
    throw Object.assign(new Error("The archive is busy."), { code: "BUSY" });
  } });
  await flush();
  h.chooseSharing(false);
  await h.select("participant-input", makeFile());
  const event = { prevented: false, preventDefault() { this.prevented = true; } };
  h.dispatchWindow("beforeunload", event);
  assert.equal(event.prevented, true);
  assert.equal(h.timers.size, 1);
  const canvas = h.calls.develop[0].canvas;
  h.dispatchWindow("pagehide", { persisted: false });
  assert.equal(h.timers.size, 0);
  assert.equal(canvas.width, 1);
  assert.equal(h.calls.dispose, 1);
  await h.advanceTime(100000);
  assert.equal(h.calls.retry, 0);
});

test("the local asset preview starts while Google connection is still unresolved", async () => {
  const connecting = deferred();
  const saving = deferred();
  const chosen = [];
  const previewBase = { name: "base.jpg", mimeType: "image/jpeg", byteLength: 10,
    path: "assets/base-photos/base.jpg", sha256: "a".repeat(64) };
  const h = harness({ connect: () => connecting.promise, assets: {
    async chooseBase(hash) { chosen.push(hash); return previewBase; }
  } });
  h.blockStart(saving.promise);
  h.chooseSharing(false);
  const selecting = h.select("participant-input", makeFile());
  await h.startReady;
  assert.equal(h.calls.start.length, 1, "development does not wait for Google bootstrap");
  assert.equal(chosen.length, 1);
  assert.match(chosen[0], /^[a-f0-9]{64}$/);
  assert.strictEqual(h.calls.start[0].choice.previewBase, previewBase);
  h.deliverPreview("preview");
  assert.equal(h.elements.get("canvas").hidden, false);
  assert.equal(h.elements.get("download-button").disabled, true);
  connecting.resolve({ totalEligible: 113, previewBase: { ...previewBase, id: "later-choice" } });
  await flush();
  assert.equal(h.calls.start.length, 1, "a late Google response cannot replace the preview");
  assert.strictEqual(h.calls.start[0].choice.previewBase, previewBase);
  saving.resolve();
  await selecting;
});

test("a delayed real SHA-256 completes before the pending operation can deliver its preview", async () => {
  const hashing = deferred();
  const hashingStarted = deferred();
  const saving = deferred();
  const chosen = [];
  const previewBase = { name: "base.jpg", mimeType: "image/jpeg", byteLength: 10,
    path: "assets/base-photos/base.jpg", sha256: "a".repeat(64) };
  const h = harness({ connect: () => new Promise(() => {}), assets: {
    async chooseBase(hash) { chosen.push(hash); return previewBase; }
  }, async digest(...args) {
    hashingStarted.resolve();
    await hashing.promise;
    return webcrypto.subtle.digest(...args);
  } });
  h.blockStart(saving.promise);
  const file = makeFile();
  h.chooseSharing(false);
  const selecting = h.select("participant-input", file);
  await hashingStarted.promise;
  await flush();
  assert.equal(h.calls.start.length, 0);
  assert.equal(h.workflow.operation, null);
  assert.equal(h.elements.get("canvas").hidden, true);
  hashing.resolve();
  const operation = await h.startReady;
  assert.strictEqual(operation, h.workflow.operation);
  assert.equal(h.workflow.pending, true, "start readiness must not wait for the archive receipt");
  assert.deepEqual(chosen, [createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex")]);
  h.deliverPreview("preview");
  assert.equal(h.elements.get("canvas").hidden, false);
  assert.equal(h.elements.get("busy-indicator").textContent, "Developing…");
  saving.resolve();
  await selecting;
});

test("bootstrap's candidate enables early preview without changing frozen consent or colour", async () => {
  const previewBase = { id: "base-1", name: "base.jpg", mimeType: "image/jpeg", byteLength: 10,
    path: "assets/base-photos/base.jpg", sha256: "a".repeat(64) };
  const h = harness({ connect: async () => ({ totalEligible: 2, previewBase }) });
  await flush();
  h.chooseSharing(true);
  h.elements.get("visitor-monochrome").checked = false;
  const saving = deferred();
  h.blockStart(saving.promise);
  const selecting = h.select("participant-input", makeFile());
  await h.startReady;
  assert.equal(h.calls.start.length, 1);
  assert.strictEqual(h.calls.start[0].choice.previewBase, previewBase);
  assert.equal(h.calls.start[0].choice.allowReuse, true);
  assert.equal(h.calls.start[0].choice.monochrome, false);
  h.deliverPreview("preview");
  assert.equal(h.elements.get("canvas").hidden, false);
  assert.equal(h.elements.get("busy-indicator").textContent, "Developing…");
  assertResultControlsLocked(h, true);
  saving.resolve();
  await selecting;
  assert.equal(h.elements.get("visitor-monochrome").disabled, false);
});

test("an identical preselected base is discarded so Google can choose a different photograph", async () => {
  const file = makeFile();
  const sha256 = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
  const previewBase = { id: "base-1", name: "base.jpg", mimeType: "image/jpeg", byteLength: file.size,
    path: "assets/base-photos/base.jpg", sha256 };
  const h = harness({ connect: async () => ({ totalEligible: 2, previewBase }) });
  await flush();
  h.chooseSharing(false);
  await h.select("participant-input", file);
  assert.equal(h.calls.start[0].choice.previewBase, undefined);
  assert.strictEqual(h.calls.start[0].file, file);
});

test("public photo choices are distinct and HTML has no inline code", () => {
  const html = fs.readFileSync(path.join(root, "double-exposure.html"), "utf8");
  assert.match(html, /id="participant-input"[^>]*>/);
  assert.match(html, /id="participant-camera-input"[^>]*capture="environment"/);
  assert.match(html, /id="camera-separator"[^>]*\bhidden>or<\/span>/);
  assert.match(html, /id="camera-picker"[^>]*\bhidden>/);
  assert.match(html, /id="camera-instructions"[^>]*\bhidden>/);
  for (const [id, value] of [["allow-reuse", "yes"], ["decline-reuse", "no"]]) {
    const radio = html.match(new RegExp(`<input\\b[^>]*id="${id}"[^>]*>`))?.[0];
    assert.ok(radio);
    assert.match(radio, /\btype="radio"/);
    assert.match(radio, /\bname="original-sharing"/);
    assert.match(radio, new RegExp(`\\bvalue="${value}"`));
    assert.doesNotMatch(radio, /\bchecked(?:\s|=|>)/);
  }
  for (const [id, label] of [["visitor-monochrome", "Black and white"], ["visitor-colour", "Original colour"]]) {
    const radio = html.match(new RegExp(`<input\\b[^>]*id="${id}"[^>]*>`))?.[0];
    assert.ok(radio, `${label} must be an explicit choice`);
    assert.match(radio, /\btype="radio"/);
    assert.match(radio, /\bname="output-colour"/);
    assert.match(html, new RegExp(`<label\\b[^>]*for="${id}"[\\s\\S]*?${label}[\\s\\S]*?<\\/label>`));
  }
  assert.match(html, /<div\b[^>]*id="output-options"[^>]*role="group"[^>]*aria-label="Image colour"/);
  assert.match(html, /<button\b[^>]*id="rotate-button"[^>]*>Rotate 90°<\/button>/);
  assert.match(html, /<p\b[^>]*id="busy-indicator"[^>]*role="status"/);
  assert.doesNotMatch(html, /id="(?:participant-preview|sharing-choice|develop-button|cancel-selection)"/);
  assert.doesNotMatch(html, /<style\b|\sstyle\s*=|\son[a-z]+\s*=|javascript\s*:/i);
  for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    assert.match(attrs, /\bsrc="/);
    assert.equal(body.trim(), "");
  }
});

test("native camera controls and instructions appear only when the browser supports capture", async () => {
  for (const supportsCapture of [false, true]) {
    const h = harness({ supportsCapture });
    await flush();
    for (const id of ["camera-picker", "camera-separator", "camera-instructions", "picker-plural"]) {
      assert.equal(h.elements.get(id).hidden, !supportsCapture, id);
    }
    assert.equal(h.elements.get("picker-singular").hidden, supportsCapture);
    assert.equal(h.elements.get("participant-input").disabled, true);
    assert.equal(h.elements.get("allow-reuse").checked, false);
    h.chooseSharing(false);
    await h.select("participant-input", makeFile());
    h.click("reset-button");
    assert.equal(h.elements.get("camera-picker").hidden, !supportsCapture);
    assert.equal(h.elements.get("camera-separator").hidden, !supportsCapture);
  }
});

test("photo choices and a shared action toolbar precede the image, with colour controls after it", () => {
  const html = fs.readFileSync(path.join(root, "double-exposure.html"), "utf8");
  const controls = html.indexOf('id="exposure-controls"');
  const stage = html.match(/<div\b[^>]*class="[^"]*\bimage-stage\b[^"]*"/)?.index ?? -1;
  const instructions = html.indexOf('id="upload-instructions"');
  const options = html.indexOf('id="output-options"');
  const browse = html.indexOf('id="source-actions"');
  const colour = html.indexOf('id="visitor-monochrome"');
  const consent = html.indexOf('id="allow-reuse"');
  const toolbar = html.match(/<div\b[^>]*class="image-toolbar"/)?.index ?? -1;
  assert.ok(controls >= 0 && stage >= 0 && options >= 0);
  for (const [name, location] of [["photo choices", browse], ["permission", consent], ["instructions", instructions]]) {
    assert.ok(location >= 0 && location < stage, `${name} must be above the image`);
  }
  assert.ok(controls < browse && controls < consent, "photo selection and permission belong to the top controls");
  assert.ok(consent < browse, "the reuse choice must precede the photo pickers");
  assert.ok(stage < options && options < colour, "the black-and-white choice remains below the image");
  assert.match(html, /<label\b[^>]*for="allow-reuse"/);
  assert.doesNotMatch(html.match(/<input\b[^>]*id="allow-reuse"[^>]*>/)[0], /\bchecked(?:\s|=|>)/);
  const repeats = html.match(/<div\b[^>]*id="repeat-actions"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(repeats && repeats.index < stage, "repeat choices belong above the image");
  assert.ok(toolbar > controls && toolbar < repeats.index, "result choices share a toolbar above the image");
  const sourceStart = html.lastIndexOf("<div", controls);
  const sourceDepth = [...html.slice(sourceStart, toolbar).matchAll(/<\/?div\b[^>]*>/g)]
    .reduce((depth, [tag]) => depth + (tag.startsWith("</") ? -1 : 1), 0);
  assert.equal(sourceDepth, 0, "repeat choices must remain outside the upload controls that hide after selection");
  assert.deepEqual([...repeats[1].matchAll(/<button\b[^>]*id="([^"]+)"[^>]*>([^<]+)<\/button>/g)]
    .map(([, id, label]) => [id, label.trim()]), [
    ["reset-button", "Upload another photo"],
    ["new-pairing-button", "Create another double exposure using this photo"]
  ]);
  const resultActions = html.match(/<div\b[^>]*id="result-actions"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(resultActions && resultActions.index > repeats.index && resultActions.index < stage,
    "download and rotation follow the repeat choices in the toolbar above the image");
  assert.deepEqual([...resultActions[1].matchAll(/<button\b[^>]*id="([^"]+)"/g)].map(([, id]) => id),
    ["download-button", "rotate-button"]);
});

test("Home links resolve and static pages do not start the archive", () => {
  const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const tool = fs.readFileSync(path.join(root, "double-exposure.html"), "utf8");
  const header = fs.readFileSync(path.join(root, "includes", "site-header.html"), "utf8");
  assert.match(home, /<a\b[^>]*href="double-exposure\.html"[^>]*>/i);
  assert.match(header, /<a\b[^>]*href="\.\/"[^>]*>\s*[^<\s]/i);
  for (const page of ["", "index.html", "double-exposure.html", "experiment-1.html", "experiment-2-part-1.html", "experiment-2-part-2.html", "experiment-3.html"]) {
    const homeLink = header.match(/<a\b[^>]*href="([^"]+)"[^>]*\bdata-site-name/)[1];
    assert.equal(new URL(homeLink, `https://aaronlinguini.github.io/linebreak/${page}`).href,
      "https://aaronlinguini.github.io/linebreak/");
  }
  assert.match(tool, /<div\b[^>]*\bdata-site-header(?:\s|=|>)/i);
  assert.match(tool, /<script\b[^>]*src="site-header\.js"[^>]*defer/i);
  for (const [, reference] of (home + header).replace(/<!--[\s\S]*?-->/g, "").matchAll(/<a\b[^>]*href="([^"#?]+\.html)(?:[?#][^"]*)?"/gi)) {
    assert.ok(fs.existsSync(path.join(root, reference)), `Home link resolves: ${reference}`);
  }
  const pages = [home];
  for (const filename of fs.readdirSync(root).filter((name) => name.endsWith(".html") && !["index.html", "double-exposure.html", "local-test.html"].includes(name))) {
    const experiment = fs.readFileSync(path.join(root, filename), "utf8");
    assert.match(experiment, /<div\b[^>]*\bdata-site-header(?:\s|=|>)/i);
    assert.match(experiment, /<script\b[^>]*src="site-header\.js"[^>]*defer/i);
    pages.push(experiment);
  }
  for (const page of pages) {
    assert.doesNotMatch(page, /<script\b[^>]*src="(?:project-config|drive-storage|drive-bridge|archive-workflow|scripts)\.js(?:\?[^"]*)?"/i);
    assert.doesNotMatch(page, /id="participant-input"|id="visitor-monochrome"/);
  }
});

test("the visitor colour radios start from the artist default and freeze either mode at photo selection", async () => {
  for (const forceBlackAndWhite of [false, true]) {
    for (const visitorChoice of [false, true]) {
      const h = harness({ forceBlackAndWhite });
      await flush();
      const checkbox = h.elements.get("visitor-monochrome");
      assert.equal(checkbox.checked, forceBlackAndWhite);
      assert.equal(h.elements.get("visitor-colour").checked, !forceBlackAndWhite);
      assert.equal(checkbox.disabled, false);
      assert.equal(h.elements.get("visitor-colour").disabled, false);
      assert.equal(h.elements.get("repeat-actions").hidden, true);
      assert.equal(h.elements.get("output-options").hidden, false);
      assert.equal(h.elements.get("exposure-controls").hidden, false);
      assert.equal(h.elements.get("upload-instructions").hidden, false);
      await h.toggleMonochrome(visitorChoice);
      assert.equal(h.calls.changeMonochrome.length, 0, "choosing a mode before a photo does not create a result");
      h.chooseSharing(false);
      await h.select("participant-input", makeFile());
      assert.equal(h.calls.start.length, 1);
      assert.equal(h.calls.start[0].choice.monochrome, visitorChoice);
      assert.equal(h.elements.get("output-options").hidden, false, "a saved exposure retains its colour-mode control");
      assert.equal(h.elements.get("exposure-controls").hidden, true);
      assert.equal(checkbox.disabled, false);
      assert.equal(h.elements.get("visitor-colour").checked, !visitorChoice);
      assert.equal(h.elements.get("visitor-colour").disabled, false);
      assert.equal(h.elements.get("repeat-actions").hidden, false);
      h.click("reset-button");
      assert.equal(h.elements.get("output-options").hidden, false);
      assert.equal(h.elements.get("exposure-controls").hidden, false);
      assert.equal(h.elements.get("upload-instructions").hidden, false);
      assert.equal(checkbox.disabled, false);
      assert.equal(checkbox.checked, visitorChoice, "Start over retains the visitor's preference");
      assert.equal(h.elements.get("visitor-colour").checked, !visitorChoice);
      assert.equal(h.elements.get("repeat-actions").hidden, true);
    }
  }
});

test("selection shows processing immediately and snapshots consent and colour before asynchronous preparation", async () => {
  const h = harness();
  await flush();
  const preparation = deferred();
  h.blockPhoto(preparation.promise);
  h.chooseSharing(true);
  h.elements.get("visitor-monochrome").checked = true;
  const file = makeFile();
  const selecting = h.select("participant-input", file);
  assert.equal(h.elements.get("workspace").attributes["aria-busy"], "true");
  assert.equal(h.elements.get("busy-indicator").hidden, false);
  assert.equal(h.elements.get("busy-indicator").textContent, developingMessage);
  assert.equal(h.elements.get("status").textContent, "");
  assert.equal(h.elements.get("canvas").hidden, true);
  assert.equal(h.elements.get("result-empty").hidden, true);
  assert.equal(h.elements.get("result-actions").hidden, true);
  assert.equal(h.elements.get("repeat-actions").hidden, true);
  assert.equal(h.elements.get("upload-instructions").hidden, true);
  for (const id of ["participant-input", "participant-camera-input", "allow-reuse", "decline-reuse", "visitor-monochrome", "visitor-colour"]) {
    assert.equal(h.elements.get(id).disabled, true, `${id} must not change a selected submission`);
  }
  assert.equal(h.calls.start.length, 0);
  h.elements.get("allow-reuse").checked = false;
  h.elements.get("visitor-monochrome").checked = false;
  preparation.resolve();
  await selecting;
  assert.equal(h.calls.start.length, 1);
  assert.equal(h.calls.start[0].file, file);
  assert.equal(h.calls.start[0].choice.allowReuse, true);
  assert.equal(h.calls.start[0].choice.monochrome, true);
  assert.equal(Object.isFrozen(h.calls.start[0].choice), true);
  assert.equal(h.elements.get("status").textContent, "", "a saved result has no extra confirmation message");
});

test("an unanswered sharing question blocks both pickers and direct file-change events", async () => {
  const h = harness();
  await flush();
  assert.equal(h.elements.get("allow-reuse").checked, false);
  assert.equal(h.elements.get("decline-reuse").checked, false);
  for (const id of ["participant-input", "participant-camera-input"]) {
    assert.equal(h.elements.get(id).disabled, true);
    await h.select(id, makeFile());
    assert.equal(h.calls.load.length, 0, "an unanswered selection must not prepare the photo");
    assert.equal(h.calls.start.length, 0, "an unanswered selection must not upload or generate");
    assert.equal(h.elements.get(id).value, "");
    assert.equal(h.elements.get("busy-indicator").hidden, true);
    assert.equal(h.elements.get("exposure-controls").hidden, false);
    assert.equal(h.elements.get("status").textContent, "Choose Yes or No before selecting a photo.");
  }
  h.chooseSharing(false);
  await h.select("participant-input", makeFile());
  assert.equal(h.calls.start.length, 1);
  assert.equal(h.calls.start[0].choice.allowReuse, false);
});

test("each sharing answer stays frozen through preparation, variants and another pairing", async () => {
  for (const allowReuse of [false, true]) {
    const h = harness();
    await flush();
    h.chooseSharing(allowReuse);
    const saving = deferred();
    h.blockStart(saving.promise);
    const selecting = h.select("participant-input", makeFile());
    await h.startReady;
    for (const id of ["allow-reuse", "decline-reuse"]) assert.equal(h.elements.get(id).disabled, true);
    h.chooseSharing(!allowReuse);
    assert.equal(h.elements.get("allow-reuse").checked, allowReuse);
    assert.equal(h.elements.get("decline-reuse").checked, !allowReuse);
    assert.equal(h.calls.start[0].choice.allowReuse, allowReuse);
    saving.resolve();
    await selecting;
    await h.toggleMonochrome(true);
    await h.click("new-pairing-button");
    assert.equal(h.calls.start.length, 1, "variants and pairings must not upload another original");
    assert.equal(h.calls.changeMonochrome.length, 1);
    assert.equal(h.calls.rePair, 1);
    assert.equal(h.elements.get("allow-reuse").checked, allowReuse);
    assert.equal(h.elements.get("decline-reuse").checked, !allowReuse);
    assert.equal(h.elements.get("exposure-controls").hidden, true, "the saved original must not be asked again");
  }
});

test("either sharing answer enables either picker, and cancelling preserves the answer", async () => {
  for (const [input, allowReuse] of [
    ["participant-input", false], ["participant-input", true],
    ["participant-camera-input", false], ["participant-camera-input", true]
  ]) {
    const h = harness();
    await flush();
    assert.equal(h.elements.get("allow-reuse").checked, false);
    assert.equal(h.elements.get("allow-reuse").disabled, false);
    assert.equal(h.elements.get("decline-reuse").checked, false);
    h.chooseSharing(allowReuse);
    assert.equal(h.elements.get(input).disabled, false);
    h.elements.get("visitor-monochrome").checked = true;
    await h.select(input, null);
    assert.equal(h.elements.get("allow-reuse").checked, allowReuse);
    assert.equal(h.elements.get("decline-reuse").checked, !allowReuse);
    assert.equal(h.elements.get("visitor-monochrome").checked, true);
    assert.equal(h.elements.get("busy-indicator").hidden, true);
    assert.equal(h.calls.load.length, 0);
    assert.equal(h.calls.start.length, 0);
    await h.select(input, makeFile());
    assert.equal(h.calls.start[0].choice.allowReuse, allowReuse);
    assert.equal(h.elements.get("output-options").hidden, false);
    assert.equal(h.elements.get("exposure-controls").hidden, true);
    h.click("reset-button");
    assert.equal(h.elements.get("allow-reuse").checked, false, "a new contribution requires a fresh opt-in");
    assert.equal(h.elements.get("decline-reuse").checked, false);
    assert.equal(h.elements.get(input).disabled, true, "a new photo needs a fresh answer");
    assert.equal(h.elements.get("output-options").hidden, false);
    assert.equal(h.elements.get("exposure-controls").hidden, false);
    await h.select(input, makeFile());
    assert.equal(h.calls.load.length, 1, "Start over must not reuse an earlier answer to prepare another original");
    assert.equal(h.calls.start.length, 1);
    h.chooseSharing(!allowReuse);
    await h.select(input, makeFile());
    assert.equal(h.calls.start.length, 2);
    assert.equal(h.calls.start[1].choice.allowReuse, !allowReuse);
  }
});

test("library and camera selection submit once and show the developed image while its archive finishes", async () => {
  for (const id of ["participant-input", "participant-camera-input"]) {
    const h = harness({ supportsCapture: id === "participant-camera-input" });
    await flush();
    const saving = deferred();
    h.blockStart(saving.promise);
    const file = makeFile();
    h.chooseSharing(false);
    const selecting = h.select(id, file);
    await h.startReady;
    assert.equal(h.calls.load[0], file);
    assert.equal(h.calls.start.length, 1);
    assert.equal(h.calls.start[0].file, file);
    assert.equal(h.calls.start[0].choice.allowReuse, false);
    assert.equal(h.elements.get(id).value, "");
    assert.equal(h.elements.get("canvas").hidden, true);
    assert.equal(h.calls.draws.length, 0, "the selected original must not appear as the developed exposure");
    assert.equal(h.elements.get("busy-indicator").hidden, false);
    assert.equal(h.elements.get("status").textContent, "");
    await h.select(id, makeFile());
    assert.equal(h.calls.start.length, 1, "a duplicate picker event cannot start another operation");
    h.deliverPreview();
    assert.equal(h.elements.get("canvas").hidden, false, "the rendered double exposure appears before the archive receipt");
    assert.equal(h.calls.draws.length, 1);
    assert.equal(h.elements.get("busy-indicator").textContent, "Developing…");
    assert.equal(h.elements.get("busy-indicator").hidden, false);
    assertResultControlsLocked(h, true);
    assert.equal(h.elements.get("new-pairing-button").hidden, false);
    assert.equal(h.elements.get("new-pairing-button").disabled, true, "another pairing waits for saving");
    await h.click("download-button");
    await h.click("rotate-button");
    assert.equal(h.calls.downloads.length, 0);
    assert.equal(h.calls.rotate, 0);
    assert.equal(h.calls.rePair, 0);
    saving.resolve();
    await selecting;
    assert.deepEqual(Array.from(new Uint8Array(await file.arrayBuffer())), [1, 2, 3]);
    assert.equal(h.calls.draws.length, 1);
    assert.equal(h.elements.get("canvas").hidden, false);
    assert.equal(h.elements.get("canvas").width, 600);
    assert.equal(h.elements.get("canvas").height, 400);
    assert.equal(h.elements.get("result-actions").hidden, false);
    assert.equal(h.elements.get("repeat-actions").hidden, false);
    assert.equal(h.elements.get("download-button").hidden, false);
    assert.equal(h.elements.get("download-button").disabled, false);
    assert.equal(h.elements.get("visitor-monochrome").disabled, false);
    assert.equal(h.elements.get("busy-indicator").hidden, true);
    assert.equal(h.elements.get("workspace").attributes["aria-busy"], "false");
    assert.equal(h.elements.get("status").textContent, "");
    await h.click("download-button");
    assert.equal(h.calls.downloads.length, 1);
    assert.equal(h.urls.get(h.calls.downloads[0].href).monochrome, false);
  }
});

test("a save failure after rendering retains the pending preview and retries without resubmitting or redrawing", async () => {
  const h = harness();
  await flush();
  const saving = deferred();
  h.blockStart(saving.promise);
  h.failStart(Object.assign(new Error("This submission could not be verified."), { originalSaved: true, code: "INVALID_TOKEN" }));
  h.chooseSharing(false);
  const selecting = h.select("participant-input", makeFile());
  await h.startReady;
  h.deliverPreview();
  saving.resolve();
  await selecting;
  assert.equal(h.workflow.pending, true);
  assert.equal(h.elements.get("canvas").hidden, false);
  assert.equal(h.elements.get("busy-indicator").hidden, true);
  assert.equal(h.elements.get("error").hidden, false);
  assert.equal(h.elements.get("retry-button").hidden, false);
  assertResultControlsLocked(h, true);
  const retryReceipt = deferred();
  h.blockRetry(retryReceipt.promise);
  const retrying = h.click("retry-button");
  h.deliverPreview();
  assert.equal(h.elements.get("canvas").hidden, false);
  assert.equal(h.elements.get("busy-indicator").textContent, "Developing…");
  retryReceipt.resolve();
  await retrying;
  assert.equal(h.calls.start.length, 1);
  assert.equal(h.calls.retry, 1);
  assert.equal(h.calls.load.length, 1);
  assert.equal(h.calls.draws.length, 1);
  assert.equal(h.urls.size, 1);
  assert.equal(h.elements.get("download-button").disabled, false);
  assert.equal(h.elements.get("visitor-monochrome").disabled, false);
  assert.equal(h.elements.get("status").textContent, "");
});

test("a pending save retries the same operation without re-reading the original or changing picker choices", async () => {
  const h = harness();
  await flush();
  h.elements.get("visitor-monochrome").checked = true;
  h.chooseSharing(true);
  h.failStart(Object.assign(new Error("This submission could not be verified."), { originalSaved: true, code: "INVALID_TOKEN" }));
  await h.select("participant-input", makeFile());
  const operation = h.workflow.operation;
  assert.equal(h.workflow.pending, true);
  assert.equal(h.elements.get("retry-button").hidden, false);
  assert.equal(h.elements.get("canvas").hidden, true);
  assert.equal(h.elements.get("result-actions").hidden, true);
  assert.equal(h.elements.get("visitor-monochrome").disabled, true);
  assert.equal(h.elements.get("visitor-colour").disabled, true);
  assert.equal(h.elements.get("allow-reuse").disabled, true);
  assert.equal(h.elements.get("reset-button").disabled, true);
  h.elements.get("visitor-monochrome").checked = false;
  h.elements.get("allow-reuse").checked = false;
  const retryReceipt = deferred();
  h.blockRetry(retryReceipt.promise);
  const retrying = h.click("retry-button");
  assert.equal(h.calls.retry, 1);
  assert.equal(h.elements.get("busy-indicator").textContent, developingMessage);
  assert.equal(h.elements.get("status").textContent, "");
  await h.click("retry-button");
  assert.equal(h.calls.retry, 1, "repeated retry clicks cannot overlap");
  retryReceipt.resolve();
  await retrying;
  assert.equal(h.workflow.operation, operation);
  assert.equal(h.calls.load.length, 1);
  assert.equal(h.calls.start.length, 1);
  assert.equal(h.calls.start[0].choice.monochrome, true);
  assert.equal(h.calls.start[0].choice.allowReuse, true);
  assert.equal(h.elements.get("canvas").hidden, false);
  assert.equal(h.elements.get("error").hidden, true);
  assert.equal(h.elements.get("status").textContent, "");
});

test("a second pairing does not reupload the original and Start over clears consent", async () => {
  const h = harness();
  await flush();
  h.chooseSharing(true);
  await h.select("participant-input", makeFile());
  assert.equal(h.calls.start[0].choice.allowReuse, true);
  assert.equal(h.elements.get("new-pairing-button").hidden, false);
  await h.click("new-pairing-button");
  assert.equal(h.calls.start.length, 1);
  assert.equal(h.calls.rePair, 1);
  assert.equal(h.elements.get("new-pairing-button").hidden, true);
  assert.equal(h.elements.get("status").textContent, "");
  h.click("reset-button");
  assert.equal(h.elements.get("source-actions").hidden, false);
  assert.equal(h.elements.get("allow-reuse").checked, false);
  assert.equal(h.elements.get("upload-instructions").hidden, false);
  assert.equal(h.calls.start.length, 1);
});

test("a second-pairing failure before its preview retains the saved image until a retry is confirmed", async () => {
  const h = harness();
  await flush();
  h.chooseSharing(false);
  await h.select("participant-input", makeFile());
  await h.click("download-button");
  const originalUrl = h.calls.downloads.at(-1).href;
  h.failRePair(Object.assign(new Error("This submission could not be verified."), { originalSaved: true, code: "INVALID_TOKEN" }));
  await h.click("new-pairing-button");
  assert.equal(h.workflow.pending, true);
  assert.equal(h.elements.get("canvas").hidden, false);
  assert.equal(h.elements.get("canvas").width, 600);
  assert.equal(h.elements.get("canvas").height, 400);
  assert.equal(h.calls.draws.length, 1);
  assert.equal(h.elements.get("download-button").disabled, true);
  assert.equal(h.elements.get("visitor-monochrome").disabled, true, "the old pair cannot create variants while a different pair is pending");
  assert.equal(h.elements.get("visitor-colour").disabled, true);
  await h.toggleMonochrome(true);
  assert.equal(h.calls.develop.length, 0);
  assert.equal(h.calls.changeMonochrome.length, 0);
  await h.click("download-button");
  assert.equal(h.calls.downloads.at(-1).href, originalUrl);
  assert.deepEqual(h.calls.revoked, []);
  assert.equal(h.elements.get("retry-button").hidden, false);
  await h.click("retry-button");
  assert.equal(h.calls.start.length, 1);
  assert.equal(h.calls.rePair, 1);
  assert.equal(h.calls.retry, 1);
  assert.equal(h.elements.get("canvas").width, 800);
  assert.equal(h.elements.get("canvas").height, 600);
  assert.equal(h.calls.draws.length, 2);
  assert.deepEqual(h.calls.revoked, [originalUrl]);
  assert.equal(h.elements.get("status").textContent, "");
});

test("a saved exposure can switch between colour and black and white without choosing another pair or original", async () => {
  const h = harness();
  await flush();
  const file = makeFile();
  h.chooseSharing(false);
  await h.select("participant-input", file);
  const base = h.workflow.operation.base;
  assert.equal(h.elements.get("output-options").hidden, false);
  assert.equal(h.elements.get("visitor-monochrome").disabled, false);
  for (const monochrome of [true, false, true]) {
    await h.toggleMonochrome(monochrome);
    assert.equal(h.workflow.operation.base, base);
    assert.equal(h.elements.get("visitor-monochrome").checked, monochrome);
    assert.equal(h.elements.get("visitor-colour").checked, !monochrome);
    assert.equal(h.elements.get("visitor-monochrome").disabled, false);
    assert.equal(h.elements.get("visitor-colour").disabled, false);
    assert.equal(h.elements.get("status").textContent, "");
    await h.click("download-button");
    const download = h.calls.downloads.at(-1);
    assert.equal(h.urls.get(download.href).monochrome, monochrome, "the download follows the confirmed variant");
  }
  assert.deepEqual(h.calls.changeMonochrome, [true], "cached modes are not archived again");
  assert.equal(h.calls.start.length, 1);
  assert.equal(h.calls.start[0].file, file);
  assert.equal(h.calls.rePair, 0);
  assert.equal(h.calls.develop.length, 1, "the second mode is rendered only once");
  h.click("reset-button");
  assert.equal(h.elements.get("visitor-monochrome").checked, true, "Start over keeps the latest confirmed colour preference");
  assert.equal(h.elements.get("allow-reuse").checked, false);
});

test("an unconfigured archive allows local choices without fabricating a result or a successful save", async () => {
  const h = harness({ configured: false, forceBlackAndWhite: true });
  await flush();
  assert.equal(h.elements.get("participant-input").disabled, true);
  assert.equal(h.elements.get("participant-camera-input").disabled, true);
  assert.equal(h.elements.get("visitor-monochrome").disabled, false);
  h.elements.get("visitor-monochrome").checked = false;
  h.chooseSharing(true);
  await h.select("participant-camera-input", makeFile());
  assert.equal(h.calls.connect, 0);
  assert.equal(h.calls.start.length, 0);
  assert.equal(h.calls.draws.length, 0);
  assert.equal(h.elements.get("canvas").hidden, true);
  assert.equal(h.elements.get("download-button").hidden, true);
  assert.equal(h.elements.get("rotate-button").hidden, true);
  assert.equal(h.elements.get("result-actions").hidden, true);
  assert.equal(h.elements.get("repeat-actions").hidden, false, "Upload another photo remains available for an unsent selection");
  assert.equal(h.elements.get("busy-indicator").hidden, true);
  assert.equal(h.elements.get("output-options").hidden, false);
  assert.equal(h.elements.get("visitor-monochrome").disabled, true, "an unsent queued selection retains its frozen mode");
  assert.equal(h.elements.get("visitor-colour").disabled, true);
  h.click("reset-button");
  assert.equal(h.elements.get("allow-reuse").checked, false);
  assert.equal(h.elements.get("visitor-monochrome").checked, false);
  assert.equal(h.elements.get("output-options").hidden, false);
  assert.equal(h.elements.get("exposure-controls").hidden, false);
  assert.equal(h.elements.get("upload-instructions").hidden, false);
});

test("connection setup stays in the status area until a selected photograph queues automatic development", async () => {
  const connection = deferred();
  const h = harness({ connect: () => connection.promise });
  for (const id of ["allow-reuse", "decline-reuse", "visitor-monochrome", "visitor-colour"]) {
    assert.equal(h.elements.get(id).disabled, false);
  }
  for (const id of ["participant-input", "participant-camera-input"]) {
    assert.equal(h.elements.get(id).disabled, true);
  }
  assert.equal(h.elements.get("status").textContent, "Please wait…");
  assert.equal(h.elements.get("busy-indicator").hidden, true);
  assert.equal(h.elements.get("workspace").attributes["aria-busy"], "false");
  h.chooseSharing(true);
  h.elements.get("visitor-monochrome").checked = true;
  await h.select("participant-camera-input", makeFile());
  assert.equal(h.elements.get("busy-indicator").hidden, false);
  assert.equal(h.elements.get("busy-indicator").textContent, developingMessage);
  assert.equal(h.elements.get("status").textContent, "");
  assert.equal(h.elements.get("workspace").attributes["aria-busy"], "true");
  assert.equal(h.elements.get("canvas").hidden, true);
  assert.equal(h.elements.get("reset-button").disabled, true);
  await h.click("retry-button");
  assert.equal(h.calls.start.length, 0);
  assert.equal(h.calls.connect, 1, "Retry cannot start another connection while the first is pending");
  connection.resolve({ totalEligible: 2 });
  await flush();
  assert.equal(h.calls.start.length, 1, "a ready collection automatically starts the queued selection");
  assert.equal(h.calls.start[0].choice.allowReuse, true);
  assert.equal(h.calls.start[0].choice.monochrome, true);
  assert.equal(h.elements.get("canvas").hidden, false);
  assert.equal(h.elements.get("status").textContent, "");
});

for (const unavailable of ["failure", "empty collection"]) {
  test(`an archive ${unavailable} preserves the queued selection and retries it once with frozen choices`, async () => {
    const h = harness({ connect: async () => {
      if (unavailable === "failure") throw Object.assign(new Error("Connection failed."), { code: "INVALID_ENDPOINT" });
      return { totalEligible: 0 };
    } });
    await flush();
    const message = "Photo submissions are temporarily unavailable.";
    assert.equal(h.elements.get("status").textContent, message);
    assert.equal(h.elements.get("participant-input").disabled, true);
    assert.equal(h.elements.get("visitor-monochrome").disabled, false);
    h.chooseSharing(true);
    h.elements.get("visitor-monochrome").checked = true;
    const file = makeFile();
    await h.select("participant-input", file);
    assert.equal(h.elements.get("status").textContent, message);
    assert.equal(h.elements.get("retry-button").hidden, false);
    assert.equal(h.elements.get("result-actions").hidden, true);
    assert.equal(h.elements.get("repeat-actions").hidden, false);
    assert.equal(h.elements.get("reset-button").disabled, false);
    assert.equal(h.elements.get("download-button").hidden, true);
    assert.equal(h.elements.get("rotate-button").hidden, true);
    assert.equal(h.elements.get("busy-indicator").hidden, true);
    assert.equal(h.calls.start.length, 0);
    h.elements.get("allow-reuse").checked = false;
    h.elements.get("visitor-monochrome").checked = false;
    const reconnected = deferred();
    h.setConnection(() => reconnected.promise);
    const retrying = h.click("retry-button");
    assert.equal(h.elements.get("busy-indicator").hidden, false);
    assert.equal(h.elements.get("status").textContent, "");
    await h.click("retry-button");
    assert.equal(h.calls.connect, 2);
    reconnected.resolve({ totalEligible: 2 });
    await retrying;
    assert.equal(h.calls.load.length, 1);
    assert.equal(h.calls.start.length, 1);
    assert.equal(h.calls.start[0].file, file);
    assert.equal(h.calls.start[0].choice.allowReuse, true);
    assert.equal(h.calls.start[0].choice.monochrome, true);
    assert.equal(h.elements.get("status").textContent, "");
  });
}

test("Start over discards an unavailable queued photo so reconnecting cannot submit it later", async () => {
  const h = harness({ connect: async () => ({ totalEligible: 0 }) });
  await flush();
  h.chooseSharing(true);
  h.elements.get("visitor-monochrome").checked = true;
  await h.select("participant-input", makeFile());
  h.click("reset-button");
  assert.equal(h.elements.get("participant-input").disabled, true);
  assert.equal(h.elements.get("allow-reuse").checked, false);
  assert.equal(h.elements.get("visitor-monochrome").checked, true);
  assert.equal(h.elements.get("upload-instructions").hidden, false);
  assert.equal(h.elements.get("status").textContent, "Photo submissions are temporarily unavailable.");
  h.setConnection(async () => ({ totalEligible: 2 }));
  await h.click("retry-button");
  assert.equal(h.calls.start.length, 0);
  h.chooseSharing(false);
  await h.select("participant-camera-input", makeFile());
  assert.equal(h.calls.start.length, 1);
  assert.equal(h.calls.start[0].choice.allowReuse, false);
});

for (const failConnection of [false, true]) {
  test(`a connection ${failConnection ? "failure" : "success"} cannot interrupt active photo-preparation feedback`, async () => {
    const connection = deferred();
    const preparation = deferred();
    const h = harness({ connect: () => connection.promise });
    h.blockPhoto(preparation.promise);
    h.chooseSharing(false);
    const selecting = h.select("participant-input", makeFile());
    assert.equal(h.elements.get("status").textContent, "");
    assert.equal(h.elements.get("busy-indicator").textContent, developingMessage);
    if (failConnection) connection.reject(Object.assign(new Error("Connection failed."), { code: "INVALID_ENDPOINT" }));
    else connection.resolve({ totalEligible: 2 });
    await flush();
    assert.equal(h.elements.get("status").textContent, "");
    assert.equal(h.elements.get("busy-indicator").hidden, false);
    assert.equal(h.elements.get("workspace").attributes["aria-busy"], "true");
    assert.equal(h.calls.start.length, 0, "connection completion must wait for preparation");
    preparation.resolve();
    await selecting;
    assert.equal(h.elements.get("busy-indicator").hidden, true);
    assert.equal(h.elements.get("canvas").hidden, failConnection);
    assert.equal(h.calls.start.length, failConnection ? 0 : 1);
    assert.equal(h.elements.get("status").textContent, failConnection ? "Photo submissions are temporarily unavailable." : "");
  });
}

test("an unsupported selection returns to the photo chooser without uploading or leaving a processing state", async () => {
  const h = harness();
  await flush();
  const unsupported = new File([Uint8Array.from([1])], "phone.txt", { type: "text/plain" });
  h.chooseSharing(false);
  await h.select("participant-input", unsupported);
  assert.equal(h.calls.start.length, 0);
  assert.equal(h.calls.draws.length, 0);
  assert.equal(h.elements.get("busy-indicator").hidden, true);
  assert.equal(h.elements.get("participant-input").disabled, true);
  assert.equal(h.elements.get("exposure-controls").hidden, false);
  assert.equal(h.elements.get("output-options").hidden, false);
  assert.equal(h.elements.get("error").textContent, "Unsupported photograph.");
  assert.equal(h.elements.get("retry-button").hidden, true);
  assert.equal(h.elements.get("canvas").hidden, true);
  h.chooseSharing(false);
  await h.select("participant-camera-input", makeFile());
  assert.equal(h.calls.start.length, 1);
  assert.equal(h.elements.get("error").hidden, true);
});

test("rotation updates the finished preview and download without creating another archive submission", async () => {
  const h = harness();
  await flush();
  assert.equal(h.elements.get("rotate-button").disabled, true);
  await h.click("rotate-button");
  assert.equal(h.calls.rotate, 0);
  h.chooseSharing(false);
  await h.select("participant-input", makeFile());
  const archivedResult = h.workflow.operation.result;
  const archivedBlob = archivedResult.blob;
  await h.click("download-button");
  const originalUrl = h.calls.downloads.at(-1).href;
  let resume;
  h.blockRotation(new Promise((resolve) => { resume = resolve; }));
  const rotating = h.click("rotate-button");
  assert.equal(h.elements.get("rotate-button").disabled, true);
  assert.equal(h.elements.get("download-button").disabled, true);
  assert.equal(h.elements.get("new-pairing-button").disabled, true);
  await h.click("rotate-button");
  assert.equal(h.calls.rotate, 1);
  resume();
  await rotating;
  assert.equal(h.elements.get("canvas").width, 400);
  assert.equal(h.elements.get("canvas").height, 600);
  assert.equal(h.elements.get("rotate-button").disabled, false);
  await h.click("download-button");
  const download = h.calls.downloads.at(-1);
  assert.notEqual(download.href, originalUrl);
  assert.equal(h.urls.get(download.href).rotated, 1);
  assert.equal(download.filename, "double-exposure-first.jpg");
  assert.deepEqual(h.calls.revoked, [originalUrl]);
  assert.equal(h.calls.start.length, 1);
  assert.equal(h.calls.rePair, 0);
  assert.equal(h.workflow.operation.result, archivedResult);
  assert.equal(h.workflow.operation.result.blob, archivedBlob);
  assert.match(h.elements.get("status").textContent, /Downloads use this orientation/);
  h.click("reset-button");
  assert.equal(h.elements.get("rotate-button").disabled, true);
});

test("a failed rotation preserves the previous download and does not offer an archive retry", async () => {
  const h = harness();
  await flush();
  h.chooseSharing(false);
  await h.select("participant-input", makeFile());
  await h.click("download-button");
  const originalUrl = h.calls.downloads.at(-1).href;
  h.failRotation(new Error("Rotation could not finish."));
  await h.click("rotate-button");
  assert.equal(h.elements.get("error").textContent, "Rotation could not finish.");
  assert.equal(h.elements.get("error").hidden, false);
  assert.equal(h.elements.get("retry-button").hidden, true);
  assert.equal(h.elements.get("rotate-button").disabled, false);
  assert.equal(h.elements.get("canvas").width, 600);
  assert.equal(h.elements.get("canvas").height, 400);
  await h.click("download-button");
  assert.equal(h.calls.downloads.at(-1).href, originalUrl);
  assert.deepEqual(h.calls.revoked, []);
  assert.equal(h.calls.start.length, 1);
  assert.equal(h.calls.rePair, 0);
});
