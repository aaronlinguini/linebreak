"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { Blob } = require("node:buffer");
const { createHash, webcrypto } = require("node:crypto");

const source = fs.readFileSync(path.join(__dirname, "..", "owner-studio.js"), "utf8");
const folderUrl = "https://drive.google.com/drive/folders/owner-results_123";
const statusResponse = { folderUrl, maxResultBytes: 12 * 1024 * 1024 };
const flush = () => new Promise(resolve => setImmediate(resolve));
const clone = value => JSON.parse(JSON.stringify(value));

function output(label, extra = {}) {
  return { blob: new Blob([Buffer.from([0xff, 0xd8, 0xff]), label, Buffer.from([0xff, 0xd9])], { type: "image/jpeg" }),
    filename: `${label}.jpg`, width: 640, height: 480, ...extra };
}

function receipt(request, extra = {}) {
  const bytes = Buffer.from(request.payload.image.base64, "base64");
  return { saved: true, sha256: createHash("sha256").update(bytes).digest("hex"),
    byteLength: bytes.length, width: request.payload.width, height: request.payload.height,
    folderUrl, fileUrl: "https://drive.google.com/file/d/saved-result_123/view", ...extra };
}

function harness({ owner = "true", initial = {}, status = statusResponse, autoStatus = true } = {}) {
  const calls = [];
  const reads = [];
  const writes = [];
  const events = new Map();
  const timers = new Map();
  const snapshots = { ...initial };
  const subscribers = new Set();
  let clock = 0;
  let nextTimer = 0;
  let subscriptions = 0;
  let unsubscriptions = 0;
  const ids = ["studio-save-feedback", "studio-save-status", "studio-save-error", "studio-save-retry", "studio-save-folder"];
  const elements = new Map(ids.map(id => {
    const listeners = new Map();
    const element = new Proxy({ hidden: true, disabled: false, href: "", textContent: "",
      addEventListener(type, callback) { listeners.set(type, callback); } }, {
      set(target, property, value) {
        writes.push({ id, property, value });
        target[property] = value;
        return true;
      }
    });
    element.listeners = listeners;
    return [id, element];
  }));
  writes.length = 0;
  class FileReader {
    readAsDataURL(blob) {
      blob.arrayBuffer().then(bytes => {
        this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString("base64")}`;
        this.onload();
      }, () => this.onerror());
    }
  }
  const localEditor = {
    snapshot(kind) { return snapshots[kind] || null; },
    subscribe(callback) {
      subscriptions++;
      subscribers.add(callback);
      callback();
      return () => { unsubscriptions++; subscribers.delete(callback); };
    }
  };
  const run = () => {
    let success;
    let failure;
    return {
      withSuccessHandler(callback) { success = callback; return this; },
      withFailureHandler(callback) { failure = callback; return this; },
      studioApi(request) {
        const call = { request: clone(request), success, failure };
        calls.push(call);
        if (request.action === "status" && autoStatus) success({ ok: true, data: clone(status) });
      }
    };
  };
  const sandbox = vm.createContext({
    Blob, FileReader, Error, crypto: webcrypto,
    document: { body: { dataset: owner === null ? {} : { ownerStudio: owner } },
      getElementById(id) {
        reads.push(id);
        assert.ok(elements.has(id), `The save adapter must not touch editor/download controls: ${id}`);
        return elements.get(id);
      } },
    window: { LocalExposureTest: localEditor, addEventListener(type, callback) { events.set(type, callback); } },
    google: { script: { get run() { return run(); } } },
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, at: clock + delay, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(source, sandbox, { filename: "owner-studio.js" });
  const api = {
    calls, reads, writes, timers, elements, snapshots,
    get subscriptions() { return subscriptions; },
    get unsubscriptions() { return unsubscriptions; },
    get saves() { return calls.filter(call => call.request.action === "save"); },
    get status() { return elements.get("studio-save-status").textContent; },
    async advance(milliseconds) {
      const end = clock + milliseconds;
      for (;;) {
        const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        clock = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
        await flush();
      }
      clock = end;
      await flush();
    },
    publish(values) {
      for (const kind of ["reference", "trial"]) snapshots[kind] = values[kind] || null;
      for (const callback of subscribers) callback();
    },
    success(call, data) { call.success({ ok: true, data: clone(data) }); },
    fail(call, code) { call.success({ ok: false, error: { code } }); },
    rpcFailure(call) { call.failure(new Error("Network unavailable")); },
    clickRetry() { elements.get("studio-save-retry").listeners.get("click")(); },
    event(type, extra = {}) {
      const event = { prevented: false, returnValue: undefined,
        preventDefault() { this.prevented = true; }, ...extra };
      events.get(type)?.(event);
      return event;
    },
    async until(predicate, message = "Expected asynchronous adapter progress") {
      const limit = Date.now() + 2000;
      while (!predicate() && Date.now() < limit) await flush();
      assert.ok(predicate(), message);
    }
  };
  return api;
}

test("ordinary local pages do not contact Google or modify any controls", async () => {
  for (const owner of [null, "false", "TRUE", ""]) {
    const h = harness({ owner });
    await flush();
    assert.equal(h.calls.length, 0);
    assert.equal(h.reads.length, 0);
    assert.equal(h.writes.length, 0);
    assert.equal(h.subscriptions, 0);
    assert.equal(h.timers.size, 0);
  }
});

test("owner initialization requests only status and displays its verified folder", async () => {
  const h = harness();
  await flush();
  assert.deepEqual(h.calls.map(call => call.request), [{ action: "status", payload: {} }]);
  assert.equal(h.elements.get("studio-save-feedback").hidden, false);
  assert.equal(h.elements.get("studio-save-folder").href, folderUrl);
  assert.equal(h.elements.get("studio-save-folder").hidden, false);
  assert.equal(h.status, "");
  assert.equal(h.elements.get("studio-save-error").hidden, true);
});

test("an existing completed result waits for verified status and then saves without another editor event", async () => {
  const h = harness({ autoStatus: false, initial: { trial: output("already-completed") } });
  assert.equal(h.status, "Saving to your folder…");
  await h.advance(800);
  assert.equal(h.saves.length, 0);
  assert.equal(h.elements.get("studio-save-folder").hidden, true);
  h.success(h.calls[0], statusResponse);
  await h.until(() => h.saves.length === 1);
  assert.equal(h.saves[0].request.payload.image.name, "already-completed.jpg");
  h.success(h.saves[0], receipt(h.saves[0].request));
  await h.until(() => h.status === "Saved to your folder.");
});

test("invalid folder locations and result limits never enable saving", async () => {
  for (const status of [
    { ...statusResponse, folderUrl: "https://attacker.example/drive/folders/owner-results_123" },
    { ...statusResponse, folderUrl: folderUrl + "?redirect=elsewhere" },
    { ...statusResponse, maxResultBytes: 0 },
    { ...statusResponse, maxResultBytes: 12 * 1024 * 1024 + 1 },
    { ...statusResponse, maxResultBytes: "1024" }
  ]) {
    const h = harness({ status });
    await flush();
    h.publish({ reference: output("reference") });
    await h.advance(800);
    assert.equal(h.saves.length, 0);
    assert.equal(h.elements.get("studio-save-folder").hidden, true);
    assert.equal(h.elements.get("studio-save-error").hidden, false);
    assert.equal(h.elements.get("studio-save-retry").hidden, false);
    assert.notEqual(h.status, "Saved to your folder.");
  }
});

test("settled reference and trial JPEGs save automatically, without uploading source images or touching downloads", async () => {
  const h = harness();
  await flush();
  const original = new Blob(["private input original"], { type: "image/png" });
  const reference = output("reference", { original, participant: original, program: "original-current" });
  const trial = output("trial", { original, base: original, program: "experimental-film-sim" });
  h.publish({ reference, trial });
  assert.equal(h.status, "Saving to your folder…");
  await h.advance(799);
  assert.equal(h.saves.length, 0);
  await h.advance(1);
  await h.until(() => h.saves.length === 1);
  assert.deepEqual(h.saves[0].request.payload, {
    program: "original-current",
    image: { name: reference.filename, mimeType: "image/jpeg", base64: Buffer.from(await reference.blob.arrayBuffer()).toString("base64") },
    width: 640, height: 480
  });
  h.success(h.saves[0], receipt(h.saves[0].request));
  await h.until(() => h.saves.length === 2);
  assert.equal(h.status, "Saving to your folder…");
  assert.deepEqual(h.saves[1].request.payload, {
    program: "experimental-film-sim",
    image: { name: trial.filename, mimeType: "image/jpeg", base64: Buffer.from(await trial.blob.arrayBuffer()).toString("base64") },
    width: 640, height: 480
  });
  h.success(h.saves[1], receipt(h.saves[1].request));
  await h.until(() => h.status === "Saved to your folder.");
  assert.deepEqual([...new Set(h.reads)].sort(), ["studio-save-error", "studio-save-feedback", "studio-save-folder", "studio-save-retry", "studio-save-status"]);
  assert.ok(h.writes.every(write => write.id.startsWith("studio-save-")));
  assert.equal(JSON.stringify(h.calls.map(call => call.request)).includes("private input original"), false);
});

test("a reused saved reference Blob is not sent again when only the trial changes", async () => {
  const h = harness();
  await flush();
  const reference = output("reference");
  const firstTrial = output("trial-one");
  h.publish({ reference, trial: firstTrial });
  await h.advance(800);
  await h.until(() => h.saves.length === 1);
  h.success(h.saves[0], receipt(h.saves[0].request));
  await h.until(() => h.saves.length === 2);
  h.success(h.saves[1], receipt(h.saves[1].request));
  await h.until(() => h.status === "Saved to your folder.");
  const nextTrial = output("trial-two");
  h.publish({ reference: { ...reference }, trial: nextTrial });
  await h.advance(800);
  await h.until(() => h.saves.length === 3);
  assert.equal(h.saves[2].request.payload.image.name, nextTrial.filename);
  h.success(h.saves[2], receipt(h.saves[2].request));
  await h.until(() => h.status === "Saved to your folder.");
  h.publish({ reference, trial: { ...nextTrial } });
  await h.advance(800);
  assert.equal(h.saves.length, 3);
});

test("changing snapshots before their settle time sends only the latest completed result", async () => {
  const h = harness();
  await flush();
  h.publish({ trial: output("discarded-preview") });
  await h.advance(600);
  h.publish({ trial: output("latest-preview") });
  await h.advance(799);
  assert.equal(h.saves.length, 0);
  await h.advance(1);
  await h.until(() => h.saves.length === 1);
  assert.equal(h.saves[0].request.payload.image.name, "latest-preview.jpg");
});

test("a transient save retry keeps its exact JPEG payload and remains pending while newer output waits", async () => {
  const h = harness();
  await flush();
  h.publish({ trial: output("first-completed") });
  await h.advance(800);
  await h.until(() => h.saves.length === 1);
  const frozenPayload = clone(h.saves[0].request.payload);
  assert.equal(h.status, "Saving to your folder…");
  h.rpcFailure(h.saves[0]);
  await flush();
  h.publish({ trial: output("new-completed") });
  await h.advance(800);
  assert.equal(h.saves.length, 1);
  assert.equal(h.status, "Saving to your folder…");
  assert.equal(h.elements.get("studio-save-retry").hidden, true);
  await h.advance(200);
  await h.until(() => h.saves.length === 2);
  assert.deepEqual(h.saves[1].request.payload, frozenPayload);
  h.success(h.saves[1], receipt(h.saves[1].request));
  await h.until(() => h.saves.length === 3);
  assert.equal(h.status, "Saving to your folder…", "an older receipt must not claim the new result is saved");
  assert.equal(h.saves[2].request.payload.image.name, "new-completed.jpg");
  h.success(h.saves[2], receipt(h.saves[2].request));
  await h.until(() => h.status === "Saved to your folder.");
});

test("a pending receipt cannot become saved merely because another snapshot notification arrives", async () => {
  const h = harness();
  await flush();
  const trial = output("pending");
  h.publish({ trial });
  await h.advance(800);
  await h.until(() => h.saves.length === 1);
  h.publish({ trial: { ...trial } });
  await h.advance(800);
  assert.equal(h.saves.length, 1);
  assert.equal(h.status, "Saving to your folder…");
  assert.equal(h.event("beforeunload").prevented, true);
});

test("mismatched save receipts never announce success and retry the same result", async () => {
  for (const mismatch of [
    { saved: false }, { sha256: "0".repeat(64) }, { byteLength: 1 }, { width: 1 }, { height: 1 },
    { fileUrl: "https://attacker.example/file/d/123/view" },
    { folderUrl: "https://drive.google.com/drive/folders/different-folder" }
  ]) {
    const h = harness();
    await flush();
    h.publish({ trial: output("receipt-check") });
    await h.advance(800);
    await h.until(() => h.saves.length === 1);
    h.success(h.saves[0], receipt(h.saves[0].request, mismatch));
    await flush();
    assert.equal(h.status, "Saving to your folder…");
    assert.equal(h.event("beforeunload").prevented, true);
    await h.advance(1000);
    await h.until(() => h.saves.length === 2);
    assert.deepEqual(h.saves[1].request, h.saves[0].request);
    h.success(h.saves[1], receipt(h.saves[1].request));
    await h.until(() => h.status === "Saved to your folder.");
  }
});

test("permanent save failures keep the result and expose manual retry without an automatic loop", async () => {
  const h = harness();
  await flush();
  h.publish({ trial: output("permanent-error") });
  await h.advance(800);
  await h.until(() => h.saves.length === 1);
  h.fail(h.saves[0], "OWNER_REQUIRED");
  await flush();
  assert.equal(h.elements.get("studio-save-error").hidden, false);
  assert.equal(h.elements.get("studio-save-retry").hidden, false);
  assert.equal(h.elements.get("studio-save-retry").disabled, false);
  assert.equal(h.status, "Saving to your folder…");
  await h.advance(30000);
  assert.equal(h.saves.length, 1);
  h.clickRetry();
  await h.until(() => h.saves.length === 2);
  assert.deepEqual(h.saves[1].request, h.saves[0].request);
  h.success(h.saves[1], receipt(h.saves[1].request));
  await h.until(() => h.status === "Saved to your folder.");
  assert.equal(h.elements.get("studio-save-error").hidden, true);
  assert.equal(h.elements.get("studio-save-retry").hidden, true);
});

test("unsaved results warn before leaving and confirmed results do not", async () => {
  const h = harness();
  await flush();
  assert.equal(h.event("beforeunload").prevented, false);
  h.publish({ trial: output("leave-warning") });
  const settling = h.event("beforeunload");
  assert.equal(settling.prevented, true);
  assert.equal(settling.returnValue, "");
  await h.advance(800);
  await h.until(() => h.saves.length === 1);
  assert.equal(h.event("beforeunload").prevented, true);
  h.success(h.saves[0], receipt(h.saves[0].request));
  await h.until(() => h.status === "Saved to your folder.");
  assert.equal(h.event("beforeunload").prevented, false);
});

test("pagehide cancels unsettled work and removes its editor subscription", async () => {
  const h = harness();
  await flush();
  h.publish({ trial: output("never-send") });
  h.event("pagehide", { persisted: false });
  const writes = h.writes.length;
  h.publish({ trial: output("after-pagehide") });
  await h.advance(5000);
  assert.equal(h.saves.length, 0);
  assert.equal(h.unsubscriptions, 1);
  assert.equal(h.writes.length, writes);
});

test("a late receipt after pagehide cannot update the UI or start a queued save", async () => {
  const h = harness();
  await flush();
  h.publish({ reference: output("in-flight"), trial: output("queued") });
  await h.advance(800);
  await h.until(() => h.saves.length === 1);
  h.event("pagehide", { persisted: false });
  const writes = h.writes.length;
  h.success(h.saves[0], receipt(h.saves[0].request));
  await flush();
  await h.advance(5000);
  assert.equal(h.saves.length, 1);
  assert.equal(h.writes.length, writes);
  assert.equal(h.unsubscriptions, 1);
});

test("a late status response after pagehide cannot reveal a folder or start saving", async () => {
  const h = harness({ autoStatus: false, initial: { trial: output("waiting-for-status") } });
  await h.advance(800);
  h.event("pagehide", { persisted: false });
  const writes = h.writes.length;
  h.success(h.calls[0], statusResponse);
  await flush();
  assert.equal(h.saves.length, 0);
  assert.equal(h.writes.length, writes);
  assert.equal(h.elements.get("studio-save-folder").hidden, true);
});

test("pagehide cancels a scheduled automatic retry without later UI writes", async () => {
  const h = harness();
  await flush();
  h.publish({ trial: output("retry-cancel") });
  await h.advance(800);
  await h.until(() => h.saves.length === 1);
  h.rpcFailure(h.saves[0]);
  await flush();
  h.event("pagehide", { persisted: false });
  const writes = h.writes.length;
  await h.advance(10000);
  assert.equal(h.saves.length, 1);
  assert.equal(h.writes.length, writes);
});
