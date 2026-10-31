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

function harness({ configured = true, canRePair = true, forceBlackAndWhite = false, assets,
  connect = async () => ({ totalEligible: 2 }) } = {}) {
  const ids = ["workspace", "canvas", "result-empty", "source-actions", "result-actions", "allow-reuse",
    "new-pairing-button", "reset-button", "participant-input", "participant-camera-input",
    "upload-label", "camera-label", "download-button", "rotate-button", "retry-button", "status", "error",
    "busy-indicator", "exposure-controls", "upload-instructions", "output-options", "visitor-monochrome"];
  const handlers = new Map();
  const elements = new Map(ids.map((id) => [id, {
    hidden: true, disabled: false, checked: false, files: [], value: "", textContent: "",
    attributes: {}, classList: { toggle() {} },
    setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute(name) { delete this.attributes[name]; },
    getContext() { return { drawImage() {} }; },
    addEventListener(type, fn) { handlers.set(id + ":" + type, fn); }
  }]));
  const calls = { start: [], connect: 0, rePair: 0, retry: 0, changeMonochrome: [], load: [], rotate: 0, downloads: [], revoked: [], draws: [] };
  elements.get("busy-indicator").textContent = developingMessage;
  elements.get("canvas").getContext = () => ({ drawImage(canvas) { calls.draws.push(canvas); } });
  const urls = new Map();
  let rotationGate;
  let rotationError;
  let startGate;
  let startError;
  let photoGate;
  let rePairGate;
  let rePairError;
  let retryGate;
  let monochromeGate;
  let monochromeError;
  let connectImpl = connect;
  let mounted = false;
  let workflow;
  let onProgress;
  const sandbox = vm.createContext({
    Error, File, setTimeout, crypto: webcrypto,
    document: {
      getElementById(id) { return mounted ? elements.get(id) : null; },
      createElement(tag) { return tag === "canvas" ? { width: 0, height: 0 } : {
        click() { calls.downloads.push({ href: this.href, filename: this.download }); }, remove() {}
      }; },
      body: { append() {} }
    },
    window: { addEventListener() {} },
    URL: {
      createObjectURL(blob) { const url = `blob:result-${urls.size + 1}`; urls.set(url, blob); return url; },
      revokeObjectURL(url) { calls.revoked.push(url); }
    },
    EXPOSURE_CONFIG: { forceBlackAndWhite },
    GoogleDriveStorage: class {
      configured = configured;
      async connect() { calls.connect++; return connectImpl(); }
      dispose() {}
    },
    ExposureArchiveWorkflow: class {
      pending = false;
      operation = null;
      constructor(options) { workflow = this; onProgress = options.onProgress; }
      async start(file, choice) {
        calls.start.push({ file, choice });
        this.pending = true;
        this.operation = { submissionId: "first", settings: { monochrome: choice.monochrome }, base: { id: "first-base" },
          result: { blob: { monochrome: choice.monochrome }, width: 600, height: 400, preparedCanvas: {} },
          receipt: { canRePair } };
        if (startGate) await startGate;
        if (startError) throw startError;
        this.pending = false;
        return this.operation;
      }
      async rePair() {
        calls.rePair++;
        this.pending = true;
        this.operation = { submissionId: "second", settings: this.operation.settings, base: { id: "second-base" },
          result: { blob: { monochrome: this.operation.settings.monochrome }, width: 800, height: 600, preparedCanvas: {} },
          receipt: { canRePair: false } };
        if (rePairGate) await rePairGate;
        if (rePairError) throw rePairError;
        this.pending = false;
        return this.operation;
      }
      async changeMonochrome(monochrome) {
        calls.changeMonochrome.push(monochrome);
        this.pending = true;
        this.operation = { submissionId: `mode-${calls.changeMonochrome.length}`, base: this.operation.base,
          settings: { ...this.operation.settings, monochrome },
          result: { blob: { monochrome }, width: 600, height: 400, preparedCanvas: {} },
          receipt: { canRePair } };
        if (monochromeGate) await monochromeGate;
        if (monochromeError) throw monochromeError;
        this.pending = false;
        return this.operation;
      }
      async retry() {
        calls.retry++;
        if (retryGate) await retryGate;
        this.pending = false;
        return this.operation;
      }
    }
  });
  if (assets) sandbox.ExposureBaseAssets = assets;
  vm.runInContext(source, sandbox);
  sandbox.createExposureProcessor = () => ({
    async loadPhoto(file) {
      calls.load.push(file);
      if (photoGate) await photoGate;
      if (file.type !== "image/jpeg") throw new Error("Unsupported photograph.");
      return { name: file.name, width: 600, height: 400, thumbnail: "data:image/jpeg;base64,AA==" };
    },
    releasePhoto() {},
    async develop() { throw new Error("Mock workflow must handle rendering."); }
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
    elements, calls, urls, get workflow() { return workflow; },
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
    setConnection(connect) { connectImpl = connect; },
    deliverPreview(stage = "archive") { return onProgress({ stage }); },
    select(id, file) {
      const input = elements.get(id);
      input.files = file ? [file] : [];
      input.value = file ? "fakepath/phone.jpg" : "";
      return handlers.get(id + ":change")();
    },
    click(id) { return handlers.get(id + ":click")(); },
    toggleMonochrome(checked) {
      elements.get("visitor-monochrome").checked = checked;
      return handlers.get("visitor-monochrome:change")();
    }
  };
}

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
  const selecting = h.select("participant-input", makeFile());
  for (let attempt = 0; attempt < 20 && !h.calls.start.length; attempt++) await flush();
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

test("bootstrap's candidate enables early preview without changing frozen consent or colour", async () => {
  const previewBase = { id: "base-1", name: "base.jpg", mimeType: "image/jpeg", byteLength: 10,
    path: "assets/base-photos/base.jpg", sha256: "a".repeat(64) };
  const h = harness({ connect: async () => ({ totalEligible: 2, previewBase }) });
  await flush();
  h.elements.get("allow-reuse").checked = true;
  h.elements.get("visitor-monochrome").checked = false;
  const saving = deferred();
  h.blockStart(saving.promise);
  const selecting = h.select("participant-input", makeFile());
  for (let attempt = 0; attempt < 20 && !h.calls.start.length; attempt++) await flush();
  assert.equal(h.calls.start.length, 1);
  assert.strictEqual(h.calls.start[0].choice.previewBase, previewBase);
  assert.equal(h.calls.start[0].choice.allowReuse, true);
  assert.equal(h.calls.start[0].choice.monochrome, false);
  h.deliverPreview("preview");
  assert.equal(h.elements.get("canvas").hidden, false);
  assert.equal(h.elements.get("busy-indicator").textContent, "Finishing…");
  for (const id of ["download-button", "rotate-button", "reset-button", "visitor-monochrome"]) {
    assert.equal(h.elements.get(id).disabled, true, "a preview does not confirm an archive");
  }
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
  await h.select("participant-input", file);
  assert.equal(h.calls.start[0].choice.previewBase, undefined);
  assert.strictEqual(h.calls.start[0].file, file);
});

test("public photo choices are distinct and HTML has no inline code", () => {
  const html = fs.readFileSync(path.join(root, "double-exposure.html"), "utf8");
  assert.match(html, /id="participant-input"[^>]*>/);
  assert.match(html, /id="participant-camera-input"[^>]*capture="environment"/);
  assert.match(html, /class="choice-separator">or<\/span>/);
  assert.match(html, /id="allow-reuse" type="checkbox"/);
  assert.match(html, /<input\b[^>]*id="visitor-monochrome"[^>]*type="checkbox"/);
  assert.match(html, /<label\b[^>]*for="visitor-monochrome"/);
  assert.match(html, /<button\b[^>]*id="rotate-button"[^>]*>Rotate 90°<\/button>/);
  assert.match(html, /<p\b[^>]*id="busy-indicator"[^>]*role="status"/);
  assert.doesNotMatch(html, /id="(?:participant-preview|sharing-choice|develop-button|cancel-selection)"/);
  assert.doesNotMatch(html, /<style\b|\sstyle\s*=|\son[a-z]+\s*=|javascript\s*:/i);
  for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    assert.match(attrs, /\bsrc="/);
    assert.equal(body.trim(), "");
  }
});

test("photo choices, permission and instructions precede the image, with colour controls after it", () => {
  const html = fs.readFileSync(path.join(root, "double-exposure.html"), "utf8");
  const controls = html.indexOf('id="exposure-controls"');
  const stage = html.match(/<div\b[^>]*class="[^"]*\bimage-stage\b[^"]*"/)?.index ?? -1;
  const instructions = html.indexOf('id="upload-instructions"');
  const options = html.indexOf('id="output-options"');
  const browse = html.indexOf('id="source-actions"');
  const colour = html.indexOf('id="visitor-monochrome"');
  const consent = html.indexOf('id="allow-reuse"');
  assert.ok(controls >= 0 && stage >= 0 && options >= 0);
  for (const [name, location] of [["photo choices", browse], ["permission", consent], ["instructions", instructions]]) {
    assert.ok(location >= 0 && location < stage, `${name} must be above the image`);
  }
  assert.ok(controls < browse && controls < consent, "photo selection and permission belong to the top controls");
  assert.ok(stage < options && options < colour, "the black-and-white choice remains below the image");
  assert.match(html, /<label\b[^>]*for="allow-reuse"/);
  assert.doesNotMatch(html.match(/<input\b[^>]*id="allow-reuse"[^>]*>/)[0], /\bchecked(?:\s|=|>)/);
});

test("Home links to the three experiment pages and exposure tool without starting the archive on static pages", () => {
  const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const tool = fs.readFileSync(path.join(root, "double-exposure.html"), "utf8");
  assert.match(home, /<a\b[^>]*href="double-exposure\.html"[^>]*>/i);
  assert.match(tool, /<a\b[^>]*href="index\.html"[^>]*>\s*Home\s*<\/a>/i);
  const pages = [home];
  for (const number of [1, 2, 3]) {
    assert.match(home, new RegExp(`<a\\b[^>]*href="experiment-${number}\\.html"[^>]*>`, "i"));
    const experiment = fs.readFileSync(path.join(root, `experiment-${number}.html`), "utf8");
    assert.match(experiment, /<a\b[^>]*href="index\.html"[^>]*>\s*Home\s*<\/a>/i);
    pages.push(experiment);
  }
  for (const page of pages) {
    assert.doesNotMatch(page, /<script\b[^>]*src="(?:project-config|drive-storage|drive-bridge|archive-workflow|scripts)\.js(?:\?[^"]*)?"/i);
    assert.doesNotMatch(page, /id="participant-input"|id="visitor-monochrome"/);
  }
});

test("the visitor checkbox starts from the artist default and freezes either mode at photo selection", async () => {
  for (const forceBlackAndWhite of [false, true]) {
    for (const visitorChoice of [false, true]) {
      const h = harness({ forceBlackAndWhite });
      await flush();
      const checkbox = h.elements.get("visitor-monochrome");
      assert.equal(checkbox.checked, forceBlackAndWhite);
      assert.equal(checkbox.disabled, false);
      assert.equal(h.elements.get("output-options").hidden, false);
      assert.equal(h.elements.get("exposure-controls").hidden, false);
      assert.equal(h.elements.get("upload-instructions").hidden, false);
      await h.toggleMonochrome(visitorChoice);
      assert.equal(h.calls.changeMonochrome.length, 0, "choosing a mode before a photo does not create a result");
      await h.select("participant-input", makeFile());
      assert.equal(h.calls.start.length, 1);
      assert.equal(h.calls.start[0].choice.monochrome, visitorChoice);
      assert.equal(h.elements.get("output-options").hidden, false, "a saved exposure retains its colour-mode control");
      assert.equal(h.elements.get("exposure-controls").hidden, true);
      assert.equal(checkbox.disabled, false);
      h.click("reset-button");
      assert.equal(h.elements.get("output-options").hidden, false);
      assert.equal(h.elements.get("exposure-controls").hidden, false);
      assert.equal(h.elements.get("upload-instructions").hidden, false);
      assert.equal(checkbox.disabled, false);
      assert.equal(checkbox.checked, visitorChoice, "Start over retains the visitor's preference");
    }
  }
});

test("selection shows processing immediately and snapshots consent and colour before asynchronous preparation", async () => {
  const h = harness();
  await flush();
  const preparation = deferred();
  h.blockPhoto(preparation.promise);
  h.elements.get("allow-reuse").checked = true;
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
  assert.equal(h.elements.get("upload-instructions").hidden, true);
  for (const id of ["participant-input", "participant-camera-input", "allow-reuse", "visitor-monochrome"]) {
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

test("consent can be chosen before either picker, and cancelling the picker does not submit or clear choices", async () => {
  for (const input of ["participant-input", "participant-camera-input"]) {
    const h = harness();
    await flush();
    assert.equal(h.elements.get("allow-reuse").checked, false);
    assert.equal(h.elements.get("allow-reuse").disabled, false);
    h.elements.get("allow-reuse").checked = true;
    h.elements.get("visitor-monochrome").checked = true;
    await h.select(input, null);
    assert.equal(h.elements.get("allow-reuse").checked, true);
    assert.equal(h.elements.get("visitor-monochrome").checked, true);
    assert.equal(h.elements.get("busy-indicator").hidden, true);
    assert.equal(h.calls.load.length, 0);
    assert.equal(h.calls.start.length, 0);
    await h.select(input, makeFile());
    assert.equal(h.calls.start[0].choice.allowReuse, true);
    assert.equal(h.elements.get("output-options").hidden, false);
    assert.equal(h.elements.get("exposure-controls").hidden, true);
    h.click("reset-button");
    assert.equal(h.elements.get("allow-reuse").checked, false, "a new contribution requires a fresh opt-in");
    assert.equal(h.elements.get("output-options").hidden, false);
    assert.equal(h.elements.get("exposure-controls").hidden, false);
  }
});

test("library and camera selection submit once and show the developed image while its archive finishes", async () => {
  for (const id of ["participant-input", "participant-camera-input"]) {
    const h = harness();
    await flush();
    const saving = deferred();
    h.blockStart(saving.promise);
    const file = makeFile();
    const selecting = h.select(id, file);
    await flush();
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
    assert.equal(h.elements.get("busy-indicator").textContent, "Finishing…");
    assert.equal(h.elements.get("busy-indicator").hidden, false);
    for (const control of ["download-button", "rotate-button", "new-pairing-button", "reset-button", "visitor-monochrome"]) {
      assert.equal(h.elements.get(control).disabled, true, `${control} must wait for the archive receipt`);
    }
    await h.click("download-button");
    await h.click("rotate-button");
    await h.click("new-pairing-button");
    h.click("reset-button");
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
    assert.equal(h.elements.get("download-button").hidden, false);
    assert.equal(h.elements.get("download-button").disabled, false);
    assert.equal(h.elements.get("visitor-monochrome").disabled, false);
    assert.equal(h.elements.get("busy-indicator").hidden, true);
    assert.equal(h.elements.get("workspace").attributes["aria-busy"], "false");
    assert.equal(h.elements.get("status").textContent, "");
  }
});

test("a save failure after rendering retains the pending preview and retries without resubmitting or redrawing", async () => {
  const h = harness();
  await flush();
  const saving = deferred();
  h.blockStart(saving.promise);
  h.failStart(Object.assign(new Error("Response lost."), { originalSaved: true }));
  const selecting = h.select("participant-input", makeFile());
  await flush();
  h.deliverPreview();
  saving.resolve();
  await selecting;
  assert.equal(h.workflow.pending, true);
  assert.equal(h.elements.get("canvas").hidden, false);
  assert.equal(h.elements.get("busy-indicator").hidden, true);
  assert.equal(h.elements.get("error").hidden, false);
  assert.equal(h.elements.get("retry-button").hidden, false);
  assert.equal(h.elements.get("retry-button").textContent, "Retry saving");
  for (const control of ["download-button", "rotate-button", "new-pairing-button", "reset-button", "visitor-monochrome"]) {
    assert.equal(h.elements.get(control).disabled, true, `${control} must not use an unconfirmed archive result`);
  }
  const retryReceipt = deferred();
  h.blockRetry(retryReceipt.promise);
  const retrying = h.click("retry-button");
  h.deliverPreview();
  assert.equal(h.elements.get("canvas").hidden, false);
  assert.equal(h.elements.get("busy-indicator").textContent, "Finishing…");
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
  h.elements.get("allow-reuse").checked = true;
  h.failStart(Object.assign(new Error("Response lost."), { originalSaved: true }));
  await h.select("participant-input", makeFile());
  const operation = h.workflow.operation;
  assert.equal(h.workflow.pending, true);
  assert.equal(h.elements.get("retry-button").hidden, false);
  assert.equal(h.elements.get("retry-button").textContent, "Retry saving");
  assert.equal(h.elements.get("canvas").hidden, true);
  assert.equal(h.elements.get("result-actions").hidden, true);
  assert.equal(h.elements.get("visitor-monochrome").disabled, true);
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
  h.elements.get("allow-reuse").checked = true;
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
  await h.select("participant-input", makeFile());
  await h.click("download-button");
  const originalUrl = h.calls.downloads.at(-1).href;
  h.failRePair(Object.assign(new Error("Response lost."), { originalSaved: true }));
  await h.click("new-pairing-button");
  assert.equal(h.workflow.pending, true);
  assert.equal(h.elements.get("canvas").hidden, false);
  assert.equal(h.elements.get("canvas").width, 600);
  assert.equal(h.elements.get("canvas").height, 400);
  assert.equal(h.calls.draws.length, 1);
  assert.equal(h.elements.get("download-button").disabled, true);
  await h.click("download-button");
  assert.equal(h.calls.downloads.at(-1).href, originalUrl);
  assert.deepEqual(h.calls.revoked, []);
  assert.equal(h.elements.get("retry-button").textContent, "Retry saving");
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
  await h.select("participant-input", file);
  const base = h.workflow.operation.base;
  assert.equal(h.elements.get("output-options").hidden, false);
  assert.equal(h.elements.get("visitor-monochrome").disabled, false);
  for (const monochrome of [true, false, true]) {
    await h.toggleMonochrome(monochrome);
    assert.equal(h.workflow.operation.base, base);
    assert.equal(h.elements.get("visitor-monochrome").checked, monochrome);
    assert.equal(h.elements.get("visitor-monochrome").disabled, false);
    assert.equal(h.elements.get("status").textContent, "");
    await h.click("download-button");
    const download = h.calls.downloads.at(-1);
    assert.equal(h.urls.get(download.href).monochrome, monochrome, "the download follows the confirmed variant");
  }
  assert.deepEqual(h.calls.changeMonochrome, [true, false, true]);
  assert.equal(h.calls.start.length, 1);
  assert.equal(h.calls.start[0].file, file);
  assert.equal(h.calls.rePair, 0);
  assert.equal(h.calls.load.length, 1);
  h.click("reset-button");
  assert.equal(h.elements.get("visitor-monochrome").checked, true, "Start over keeps the latest confirmed colour preference");
  assert.equal(h.elements.get("allow-reuse").checked, false);
});

test("a mode change blocks duplicate changes until its archive operation finishes", async () => {
  const h = harness();
  await flush();
  await h.select("participant-input", makeFile());
  const receipt = deferred();
  h.blockMonochrome(receipt.promise);
  const changing = h.toggleMonochrome(true);
  assert.deepEqual(h.calls.changeMonochrome, [true]);
  assert.equal(h.elements.get("visitor-monochrome").disabled, true);
  assert.equal(h.elements.get("output-options").hidden, false);
  assert.equal(h.elements.get("new-pairing-button").disabled, true);
  assert.equal(h.elements.get("busy-indicator").hidden, false);
  assert.equal(h.elements.get("status").textContent, "");
  await h.toggleMonochrome(false);
  assert.deepEqual(h.calls.changeMonochrome, [true], "a second event cannot start another archive operation");
  receipt.resolve();
  await changing;
  assert.equal(h.elements.get("visitor-monochrome").checked, true, "the checkbox reflects the completed operation rather than an ignored event");
  assert.equal(h.elements.get("visitor-monochrome").disabled, false);
  assert.equal(h.elements.get("busy-indicator").hidden, true);
});

test("a failed mode save retains the prior image and retries its frozen mode without changing the pair", async () => {
  const h = harness();
  await flush();
  await h.select("participant-input", makeFile());
  const base = h.workflow.operation.base;
  await h.click("download-button");
  const originalUrl = h.calls.downloads.at(-1).href;
  h.failMonochrome(Object.assign(new Error("Response lost."), { originalSaved: true }));
  await h.toggleMonochrome(true);
  const pendingOperation = h.workflow.operation;
  assert.equal(h.workflow.pending, true);
  assert.equal(pendingOperation.settings.monochrome, true);
  assert.equal(h.elements.get("visitor-monochrome").disabled, true);
  assert.equal(h.elements.get("output-options").hidden, false);
  assert.equal(h.elements.get("canvas").hidden, false);
  assert.equal(h.calls.draws.length, 1);
  assert.equal(h.elements.get("download-button").disabled, true);
  assert.equal(h.elements.get("retry-button").textContent, "Retry saving");
  await h.click("download-button");
  assert.equal(h.calls.downloads.at(-1).href, originalUrl);
  assert.deepEqual(h.calls.revoked, []);
  await h.toggleMonochrome(false);
  assert.deepEqual(h.calls.changeMonochrome, [true]);
  const receipt = deferred();
  h.blockRetry(receipt.promise);
  const retrying = h.click("retry-button");
  assert.equal(h.elements.get("visitor-monochrome").disabled, true);
  assert.equal(h.workflow.operation.settings.monochrome, true);
  receipt.resolve();
  await retrying;
  assert.equal(h.workflow.operation, pendingOperation);
  assert.equal(h.workflow.operation.base, base);
  assert.equal(h.calls.start.length, 1);
  assert.equal(h.calls.rePair, 0);
  assert.equal(h.calls.retry, 1);
  assert.equal(h.calls.draws.length, 2);
  assert.deepEqual(h.calls.revoked, [originalUrl]);
  assert.equal(h.elements.get("visitor-monochrome").checked, true);
  assert.equal(h.elements.get("visitor-monochrome").disabled, false);
  assert.equal(h.elements.get("status").textContent, "");
  await h.click("download-button");
  assert.equal(h.urls.get(h.calls.downloads.at(-1).href).monochrome, true);
});

test("an unconfigured archive allows local choices without fabricating a result or a successful save", async () => {
  const h = harness({ configured: false, forceBlackAndWhite: true });
  await flush();
  assert.equal(h.elements.get("participant-input").disabled, false);
  assert.equal(h.elements.get("participant-camera-input").disabled, false);
  assert.equal(h.elements.get("visitor-monochrome").disabled, false);
  h.elements.get("visitor-monochrome").checked = false;
  h.elements.get("allow-reuse").checked = true;
  await h.select("participant-camera-input", makeFile());
  assert.equal(h.calls.connect, 0);
  assert.equal(h.calls.start.length, 0);
  assert.equal(h.calls.draws.length, 0);
  assert.equal(h.elements.get("canvas").hidden, true);
  assert.equal(h.elements.get("download-button").hidden, true);
  assert.equal(h.elements.get("rotate-button").hidden, true);
  assert.equal(h.elements.get("result-actions").hidden, false, "Start over remains available for an unsent selection");
  assert.equal(h.elements.get("busy-indicator").hidden, true);
  assert.equal(h.elements.get("output-options").hidden, false);
  assert.equal(h.elements.get("visitor-monochrome").disabled, true, "an unsent queued selection retains its frozen mode");
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
  for (const id of ["participant-input", "participant-camera-input", "allow-reuse", "visitor-monochrome"]) {
    assert.equal(h.elements.get(id).disabled, false);
  }
  assert.equal(h.elements.get("status").textContent, "Connecting…");
  assert.equal(h.elements.get("busy-indicator").hidden, true);
  assert.equal(h.elements.get("workspace").attributes["aria-busy"], "false");
  h.elements.get("allow-reuse").checked = true;
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
      if (unavailable === "failure") throw new Error("Connection failed.");
      return { totalEligible: 0 };
    } });
    await flush();
    const message = "Photo submissions are temporarily unavailable.";
    assert.equal(h.elements.get("status").textContent, message);
    assert.equal(h.elements.get("participant-input").disabled, false);
    assert.equal(h.elements.get("visitor-monochrome").disabled, false);
    h.elements.get("allow-reuse").checked = true;
    h.elements.get("visitor-monochrome").checked = true;
    const file = makeFile();
    await h.select("participant-input", file);
    assert.equal(h.elements.get("status").textContent, message);
    assert.equal(h.elements.get("retry-button").hidden, false);
    assert.equal(h.elements.get("result-actions").hidden, false);
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
  h.elements.get("allow-reuse").checked = true;
  h.elements.get("visitor-monochrome").checked = true;
  await h.select("participant-input", makeFile());
  h.click("reset-button");
  assert.equal(h.elements.get("participant-input").disabled, false);
  assert.equal(h.elements.get("allow-reuse").checked, false);
  assert.equal(h.elements.get("visitor-monochrome").checked, true);
  assert.equal(h.elements.get("upload-instructions").hidden, false);
  assert.equal(h.elements.get("status").textContent, "Photo submissions are temporarily unavailable.");
  h.setConnection(async () => ({ totalEligible: 2 }));
  await h.click("retry-button");
  assert.equal(h.calls.start.length, 0);
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
    const selecting = h.select("participant-input", makeFile());
    assert.equal(h.elements.get("status").textContent, "");
    assert.equal(h.elements.get("busy-indicator").textContent, developingMessage);
    if (failConnection) connection.reject(new Error("Connection failed."));
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
  await h.select("participant-input", unsupported);
  assert.equal(h.calls.start.length, 0);
  assert.equal(h.calls.draws.length, 0);
  assert.equal(h.elements.get("busy-indicator").hidden, true);
  assert.equal(h.elements.get("participant-input").disabled, false);
  assert.equal(h.elements.get("exposure-controls").hidden, false);
  assert.equal(h.elements.get("output-options").hidden, false);
  assert.equal(h.elements.get("error").textContent, "Unsupported photograph.");
  assert.equal(h.elements.get("retry-button").hidden, true);
  assert.equal(h.elements.get("canvas").hidden, true);
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
