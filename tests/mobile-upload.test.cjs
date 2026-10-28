"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { File } = require("node:buffer");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts.js"), "utf8");
const inputIds = ["participant-input", "participant-camera-input"];
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function photo(name = "phone.jpg", type = "image/jpeg") {
  return new File([Uint8Array.from([1,2,3,4])], name, { type });
}

function harness(options = {}) {
  const elements = new Map();
  const listeners = new Map();
  const prepared = [];
  const originals = [];
  const released = [];
  let workflow;
  let mounted = false;
  for (const id of ["workspace", "canvas", "result-empty", "participant-preview", ...inputIds, "upload-label", "camera-label", "download-button", "retry-button", "status", "error", "busy-indicator"]) {
    elements.set(id, {
      hidden: true, disabled: false, files: [], value: "", textContent: "",
      classList: { toggle() {} },
      setAttribute() {},
      addEventListener(type, handler) { listeners.set(`${id}:${type}`, handler); }
    });
  }
  const sandbox = vm.createContext({
    Error, File, setTimeout,
    document: { getElementById(id) { return mounted ? elements.get(id) : null; } },
    window: { addEventListener() {} },
    URL: { createObjectURL() { return "blob:mobile-result"; }, revokeObjectURL() {} },
    EXPOSURE_CONFIG: { forceBlackAndWhite: false },
    GoogleDriveStorage: class {
      configured = options.configured !== false;
      async connect() {
        if (options.connection) await options.connection.promise;
        return { totalEligible: options.totalEligible ?? 1 };
      }
      dispose() {}
    },
    ExposureArchiveWorkflow: class {
      pending = false;
      constructor() { workflow = this; }
      async start(file) {
        originals.push(file);
        this.pending = true;
        try {
          if (options.archive) await options.archive.promise;
          this.pending = false;
          return { result: { blob: {} }, submissionId: "mobile-test" };
        } catch (error) {
          this.pending = options.keepPendingOnError === true;
          throw error;
        }
      }
    }
  });
  vm.runInContext(source, sandbox);
  sandbox.createExposureProcessor = () => ({
    async loadPhoto(file) {
      prepared.push(file);
      if (options.preparation) await options.preparation.promise;
      if (file.type !== "image/jpeg") throw new Error("Unsupported photograph.");
      return { name: file.name, width: 600, height: 400 };
    },
    releasePhoto(value) { if (value) released.push(value); },
    async develop() { return { blob: {} }; }
  });
  mounted = true;
  sandbox.initializeExposureStudio();
  async function select(id, file) {
    const input = elements.get(id);
    input.files = file ? [file] : [];
    input.value = file ? `fakepath/${file.name}` : "";
    return listeners.get(`${id}:change`)();
  }
  function bothDisabled(value) {
    for (const id of inputIds) assert.equal(elements.get(id).disabled, value, id);
  }
  return { elements, prepared, originals, released, select, bothDisabled, get workflow() { return workflow; } };
}

test("the camera request keeps the photo library available and all behaviour external", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const library = html.match(/<input\b[^>]*\bid="participant-input"[^>]*>/)?.[0];
  const camera = html.match(/<input\b[^>]*\bid="participant-camera-input"[^>]*>/)?.[0];
  assert.ok(library);
  assert.ok(camera);
  assert.doesNotMatch(library, /\bcapture\s*=/);
  assert.match(camera, /\baccept="image\/jpeg"/);
  assert.match(camera, /\bcapture="environment"/);
  assert.match(html, /<label\b[^>]*\bfor="participant-camera-input"/);
  assert.doesNotMatch(html, /<style\b|\sstyle\s*=|\son[a-z]+\s*=|javascript\s*:/i);
  for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    assert.match(attributes, /\bsrc="/);
    assert.equal(body.trim(), "");
  }
});

test("camera and library selections archive the exact File originally selected", async () => {
  for (const id of inputIds) {
    const h = harness();
    await flush();
    h.bothDisabled(false);
    const file = photo(id === "participant-input" ? "library.jpg" : "camera.jpg");
    const otherId = inputIds.find((inputId) => inputId !== id);
    h.elements.get(otherId).value = "untouched";
    await h.select(id, file);
    assert.equal(h.prepared[0], file);
    assert.equal(h.originals[0], file);
    assert.deepEqual(Array.from(new Uint8Array(await h.originals[0].arrayBuffer())), [1,2,3,4]);
    assert.equal(h.elements.get(id).value, "");
    assert.equal(h.elements.get(otherId).value, "untouched");
    assert.equal(h.elements.get("status").textContent, "Saved to the archive.");
    h.bothDisabled(false);
  }
});

test("neither input can bypass a missing connection or empty source collection", async () => {
  for (const options of [{ configured: false }, { totalEligible: 0 }]) {
    const h = harness(options);
    await flush();
    h.bothDisabled(true);
    for (const id of inputIds) await h.select(id, photo());
    assert.equal(h.prepared.length, 0);
    assert.equal(h.originals.length, 0);
  }
});

test("both choices remain disabled until the archive connection is ready", async () => {
  const connection = deferred();
  const h = harness({ connection });
  h.bothDisabled(true);
  for (const id of inputIds) await h.select(id, photo());
  assert.equal(h.prepared.length, 0);
  connection.resolve();
  await flush();
  h.bothDisabled(false);
});

test("photo preparation and a pending archive block overlapping selections from either route", async () => {
  const preparation = deferred();
  const archive = deferred();
  const h = harness({ preparation, archive, keepPendingOnError: true });
  await flush();
  const first = photo("camera-original.jpg");
  const pendingSelection = h.select("participant-camera-input", first);
  h.bothDisabled(true);
  await h.select("participant-input", photo("must-not-replace-original.jpg"));
  assert.equal(h.prepared.length, 1);
  preparation.resolve();
  await flush();
  h.bothDisabled(true);
  assert.equal(h.originals[0], first);
  await h.select("participant-camera-input", photo("must-not-overlap.jpg"));
  assert.equal(h.prepared.length, 1);
  archive.reject(Object.assign(new Error("Archive needs retry."), { originalSaved: true }));
  await pendingSelection;
  assert.equal(h.workflow.pending, true);
  h.bothDisabled(true);
  for (const id of inputIds) await h.select(id, photo("still-pending.jpg"));
  assert.equal(h.prepared.length, 1);
  assert.equal(h.originals.length, 1);
});

test("a rejected camera file resets that picker and permits another photo", async () => {
  const h = harness();
  await flush();
  await h.select("participant-camera-input", photo("unsupported.heic", "image/heic"));
  assert.equal(h.elements.get("participant-camera-input").value, "");
  assert.equal(h.elements.get("error").textContent, "Unsupported photograph.");
  assert.equal(h.originals.length, 0);
  h.bothDisabled(false);
  const valid = photo("retaken.jpg");
  await h.select("participant-camera-input", valid);
  assert.equal(h.originals[0], valid);
  assert.equal(h.elements.get("error").hidden, true);
  h.bothDisabled(false);
});

test("cancelling either picker does not prepare or archive a photograph", async () => {
  const h = harness();
  await flush();
  const previousStatus = h.elements.get("status").textContent;
  for (const id of inputIds) await h.select(id, null);
  assert.equal(h.prepared.length, 0);
  assert.equal(h.originals.length, 0);
  assert.equal(h.elements.get("status").textContent, previousStatus);
  h.bothDisabled(false);
});
