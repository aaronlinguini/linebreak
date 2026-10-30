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

function harness({ configured = true, canRePair = true, forceBlackAndWhite = false } = {}) {
  const ids = ["workspace", "canvas", "result-empty", "participant-preview", "source-actions",
    "sharing-choice", "result-actions", "allow-reuse", "develop-button", "cancel-selection",
    "new-pairing-button", "reset-button", "participant-input", "participant-camera-input",
    "upload-label", "camera-label", "download-button", "rotate-button", "retry-button", "status", "error",
    "busy-indicator", "exposure-controls", "upload-instructions", "output-options", "visitor-monochrome"];
  const handlers = new Map();
  const elements = new Map(ids.map((id) => [id, {
    hidden: true, disabled: false, checked: false, files: [], value: "", textContent: "",
    classList: { toggle() {} }, setAttribute() {}, removeAttribute() {},
    getContext() { return { drawImage() {} }; },
    addEventListener(type, fn) { handlers.set(id + ":" + type, fn); }
  }]));
  const calls = { start: [], rePair: 0, load: [], rotate: 0, downloads: [], revoked: [] };
  const urls = new Map();
  let rotationGate;
  let rotationError;
  let startGate;
  let startError;
  let mounted = false;
  let workflow;
  const sandbox = vm.createContext({
    Error, File, setTimeout,
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
      async connect() { return { totalEligible: 2 }; }
      dispose() {}
    },
    ExposureArchiveWorkflow: class {
      pending = false;
      operation = null;
      constructor() { workflow = this; }
      async start(file, choice) {
        calls.start.push({ file, choice });
        this.pending = true;
        if (startGate) await startGate;
        if (startError) throw startError;
        this.operation = { submissionId: "first", result: { blob: {}, width: 600, height: 400, preparedCanvas: {} },
          receipt: { canRePair } };
        this.pending = false;
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
  const html = fs.readFileSync(path.join(root, "double-exposure.html"), "utf8");
  assert.match(html, /id="participant-input"[^>]*>/);
  assert.match(html, /id="participant-camera-input"[^>]*capture="environment"/);
  assert.match(html, /class="choice-separator">or<\/span>/);
  assert.match(html, /id="allow-reuse" type="checkbox"/);
  assert.match(html, /<input\b[^>]*id="visitor-monochrome"[^>]*type="checkbox"/);
  assert.match(html, /<label\b[^>]*for="visitor-monochrome"/);
  assert.match(html, /<button\b[^>]*id="rotate-button"[^>]*>Rotate 90°<\/button>/);
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
  const create = html.indexOf('id="sharing-choice"');
  const colour = html.indexOf('id="visitor-monochrome"');
  const consent = html.indexOf('id="allow-reuse"');
  assert.ok(controls >= 0 && stage >= 0 && options >= 0);
  for (const [name, location] of [["photo choices", browse], ["creation actions", create], ["permission", consent], ["instructions", instructions]]) {
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

test("the visitor checkbox starts from the artist default and sends either colour mode at creation", async () => {
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
      checkbox.checked = visitorChoice;
      await h.select("participant-input", makeFile());
      assert.equal(h.elements.get("upload-instructions").hidden, true);
      assert.equal(checkbox.checked, visitorChoice, "choosing a photograph retains the visitor selection");
      await h.click("develop-button");
      assert.equal(h.calls.start[0].choice.monochrome, visitorChoice);
      assert.equal(h.elements.get("output-options").hidden, true, "an archived result cannot be relabelled as another colour mode");
      assert.equal(h.elements.get("exposure-controls").hidden, true);
      assert.equal(checkbox.disabled, true);
      h.click("reset-button");
      assert.equal(h.elements.get("output-options").hidden, false);
      assert.equal(h.elements.get("exposure-controls").hidden, false);
      assert.equal(h.elements.get("upload-instructions").hidden, false);
      assert.equal(checkbox.disabled, false);
      assert.equal(checkbox.checked, visitorChoice, "Start over retains the visitor's preference");
    }
  }
});

test("the visitor colour choice is retained on Back and remains usable while the archive is unconfigured", async () => {
  const h = harness({ forceBlackAndWhite: true });
  await flush();
  h.elements.get("visitor-monochrome").checked = false;
  await h.select("participant-camera-input", makeFile());
  h.click("cancel-selection");
  assert.equal(h.elements.get("visitor-monochrome").checked, false);
  assert.equal(h.elements.get("output-options").hidden, false);
  assert.equal(h.elements.get("exposure-controls").hidden, false);
  assert.equal(h.elements.get("upload-instructions").hidden, false);
  const offline = harness({ configured: false, forceBlackAndWhite: true });
  await flush();
  assert.equal(offline.elements.get("output-options").hidden, false);
  assert.equal(offline.elements.get("exposure-controls").hidden, false);
  assert.equal(offline.elements.get("visitor-monochrome").checked, true);
  assert.equal(offline.elements.get("visitor-monochrome").disabled, false);
});

test("creating or retrying a pending save cannot change its colour choice through the page", async () => {
  const h = harness();
  await flush();
  await h.select("participant-input", makeFile());
  h.elements.get("visitor-monochrome").checked = true;
  h.elements.get("allow-reuse").checked = true;
  let resume;
  h.blockStart(new Promise(resolve => { resume = resolve; }));
  h.failStart(Object.assign(new Error("Response lost."), { originalSaved: true }));
  const saving = h.click("develop-button");
  assert.equal(h.elements.get("visitor-monochrome").disabled, true);
  assert.equal(h.elements.get("allow-reuse").disabled, true);
  assert.equal(h.calls.start[0].choice.monochrome, true);
  assert.equal(h.calls.start[0].choice.allowReuse, true);
  resume();
  await saving;
  assert.equal(h.workflow.pending, true);
  assert.equal(h.elements.get("output-options").hidden, true);
  assert.equal(h.elements.get("exposure-controls").hidden, true);
  assert.equal(h.elements.get("visitor-monochrome").disabled, true);
  assert.equal(h.elements.get("allow-reuse").disabled, true);
});

test("consent can be selected before either photo chooser and reaches Create without being cleared", async () => {
  for (const input of ["participant-input", "participant-camera-input"]) {
    const h = harness();
    await flush();
    assert.equal(h.elements.get("output-options").hidden, false);
    assert.equal(h.elements.get("exposure-controls").hidden, false);
    assert.equal(h.elements.get("allow-reuse").checked, false);
    assert.equal(h.elements.get("allow-reuse").disabled, false);
    h.elements.get("allow-reuse").checked = true;
    await h.select(input, null);
    assert.equal(h.elements.get("allow-reuse").checked, true, "cancelling a chooser preserves the unsent choice");
    await h.select(input, makeFile());
    assert.equal(h.elements.get("allow-reuse").checked, true, "choosing a photo preserves consent selected beforehand");
    assert.equal(h.elements.get("output-options").hidden, false);
    assert.equal(h.elements.get("exposure-controls").hidden, false);
    assert.equal(h.calls.start.length, 0);
    await h.click("develop-button");
    assert.equal(h.calls.start[0].choice.allowReuse, true);
    assert.equal(h.elements.get("output-options").hidden, true);
    assert.equal(h.elements.get("exposure-controls").hidden, true);
    h.click("reset-button");
    assert.equal(h.elements.get("allow-reuse").checked, false, "a new contribution requires a fresh opt-in");
    assert.equal(h.elements.get("output-options").hidden, false);
    assert.equal(h.elements.get("exposure-controls").hidden, false);
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
  h.elements.get("allow-reuse").checked = true;
  await h.select("participant-camera-input", makeFile());
  h.click("cancel-selection");
  assert.equal(h.calls.start.length, 0);
  assert.equal(h.elements.get("source-actions").hidden, false);
  assert.equal(h.elements.get("allow-reuse").checked, false);
  assert.equal(h.elements.get("output-options").hidden, false);
  assert.equal(h.elements.get("exposure-controls").hidden, false);
  assert.equal(h.elements.get("upload-instructions").hidden, false);
  const offline = harness({ configured: false });
  await flush();
  assert.equal(offline.elements.get("participant-input").disabled, true);
  assert.equal(offline.elements.get("participant-camera-input").disabled, true);
  assert.equal(offline.elements.get("status").textContent, "");
  await offline.select("participant-camera-input", makeFile());
  assert.equal(offline.calls.load.length, 0);
});

test("rotation updates the finished preview and download without creating another archive submission", async () => {
  const h = harness();
  await flush();
  assert.equal(h.elements.get("rotate-button").disabled, true);
  await h.click("rotate-button");
  assert.equal(h.calls.rotate, 0);
  await h.select("participant-input", makeFile());
  await h.click("develop-button");
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
  await h.click("develop-button");
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
