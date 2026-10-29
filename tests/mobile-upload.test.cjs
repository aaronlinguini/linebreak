"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { File } = require("node:buffer");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts.js"), "utf8");
const flush = () => new Promise((resolve) => setImmediate(resolve));
const makeFile = () => new File([Uint8Array.from([1, 2, 3])], "phone.jpg", { type: "image/jpeg" });

function harness({ configured = true, canRePair = true } = {}) {
  const ids = ["workspace", "canvas", "result-empty", "participant-preview", "source-actions",
    "sharing-choice", "result-actions", "allow-reuse", "develop-button", "cancel-selection",
    "new-pairing-button", "reset-button", "participant-input", "participant-camera-input",
    "upload-label", "camera-label", "download-button", "retry-button", "status", "error",
    "busy-indicator"];
  const handlers = new Map();
  const elements = new Map(ids.map((id) => [id, {
    hidden: true, disabled: false, checked: false, files: [], value: "", textContent: "",
    classList: { toggle() {} }, setAttribute() {}, removeAttribute() {},
    getContext() { return { drawImage() {} }; },
    addEventListener(type, fn) { handlers.set(id + ":" + type, fn); }
  }]));
  const calls = { start: [], rePair: 0, load: [] };
  let mounted = false;
  let workflow;
  const sandbox = vm.createContext({
    Error, File, setTimeout,
    document: {
      getElementById(id) { return mounted ? elements.get(id) : null; },
      createElement(tag) { return tag === "canvas" ? { width: 0, height: 0 } : { click() {}, remove() {} }; },
      body: { append() {} }
    },
    window: { addEventListener() {} },
    URL: { createObjectURL() { return "blob:result"; }, revokeObjectURL() {} },
    EXPOSURE_CONFIG: { forceBlackAndWhite: false },
    GoogleDriveStorage: class {
      configured = configured;
      async connect() { return { totalEligible: 2 }; }
      dispose() {}
    },
    ExposureArchiveWorkflow: class {
      pending = false;
      operation = null;
      constructor() { workflow = this; }
      async start(file, choice) {
        calls.start.push({ file, choice });
        this.operation = { submissionId: "first", result: { blob: {}, width: 600, height: 400, preparedCanvas: {} },
          receipt: { canRePair } };
        return this.operation;
      }
      async rePair() {
        calls.rePair++;
        this.operation = { submissionId: "second", result: { blob: {}, width: 600, height: 400, preparedCanvas: {} },
          receipt: { canRePair: false } };
        return this.operation;
      }
    }
  });
  vm.runInContext(source, sandbox);
  sandbox.createExposureProcessor = () => ({
    async loadPhoto(file) {
      calls.load.push(file);
      if (file.type !== "image/jpeg") throw new Error("Unsupported photograph.");
      return { name: file.name, width: 600, height: 400, thumbnail: "data:image/jpeg;base64,AA==" };
    },
    releasePhoto() {},
    async develop() { throw new Error("Mock workflow must handle rendering."); }
  });
  mounted = true;
  sandbox.initializeExposureStudio();
  return {
    elements, calls, get workflow() { return workflow; },
    select(id, file) {
      const input = elements.get(id);
      input.files = file ? [file] : [];
      input.value = file ? "fakepath/phone.jpg" : "";
      return handlers.get(id + ":change")();
    },
    click(id) { return handlers.get(id + ":click")(); }
  };
}

test("public photo choices are distinct and HTML has no inline code", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /id="participant-input"[^>]*>/);
  assert.match(html, /id="participant-camera-input"[^>]*capture="environment"/);
  assert.match(html, /class="choice-separator">or<\/span>/);
  assert.match(html, /id="allow-reuse" type="checkbox"/);
  assert.doesNotMatch(html, /<style\b|\sstyle\s*=|\son[a-z]+\s*=|javascript\s*:/i);
  for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    assert.match(attrs, /\bsrc="/);
    assert.equal(body.trim(), "");
  }
});

test("library and camera selections wait for explicit create and default to no reuse", async () => {
  for (const id of ["participant-input", "participant-camera-input"]) {
    const h = harness();
    await flush();
    const file = makeFile();
    await h.select(id, file);
    assert.equal(h.calls.load[0], file);
    assert.equal(h.calls.start.length, 0);
    assert.equal(h.elements.get("allow-reuse").checked, false);
    assert.equal(h.elements.get("sharing-choice").hidden, false);
    assert.equal(h.elements.get("participant-preview").hidden, false);
    assert.equal(h.elements.get(id).value, "");
    await h.click("develop-button");
    assert.equal(h.calls.start[0].file, file);
    assert.equal(h.calls.start[0].choice.allowReuse, false);
    assert.deepEqual(Array.from(new Uint8Array(await file.arrayBuffer())), [1, 2, 3]);
    assert.equal(h.elements.get("result-actions").hidden, false);
  }
});

test("explicit future-use choice and a second pairing do not reupload through the page", async () => {
  const h = harness();
  await flush();
  await h.select("participant-input", makeFile());
  h.elements.get("allow-reuse").checked = true;
  await h.click("develop-button");
  assert.equal(h.calls.start[0].choice.allowReuse, true);
  assert.equal(h.elements.get("new-pairing-button").hidden, false);
  await h.click("new-pairing-button");
  assert.equal(h.calls.start.length, 1);
  assert.equal(h.calls.rePair, 1);
  assert.equal(h.elements.get("new-pairing-button").hidden, true);
  h.click("reset-button");
  assert.equal(h.elements.get("source-actions").hidden, false);
  assert.equal(h.elements.get("allow-reuse").checked, false);
  assert.equal(h.calls.start.length, 1);
});

test("back cancels the local selection before upload; unconfigured site shows no internal status", async () => {
  const h = harness();
  await flush();
  await h.select("participant-camera-input", makeFile());
  h.click("cancel-selection");
  assert.equal(h.calls.start.length, 0);
  assert.equal(h.elements.get("source-actions").hidden, false);
  const offline = harness({ configured: false });
  await flush();
  assert.equal(offline.elements.get("participant-input").disabled, true);
  assert.equal(offline.elements.get("participant-camera-input").disabled, true);
  assert.equal(offline.elements.get("status").textContent, "");
  await offline.select("participant-camera-input", makeFile());
  assert.equal(offline.calls.load.length, 0);
});
