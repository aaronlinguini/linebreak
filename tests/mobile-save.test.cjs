"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { Blob } = require("node:buffer");

const source = fs.readFileSync(path.join(__dirname, "..", "scripts.js"), "utf8");
const jpeg = marker => new Blob([Uint8Array.from([255, 216, marker, 255, 217])], { type: "image/jpeg" });

function harness(navigator) {
  const downloads = [];
  const urls = new Map();
  const timers = [];
  let nextUrl = 0;
  const sandbox = vm.createContext({ Blob, navigator,
    URL: {
      createObjectURL(blob) {
        const url = `blob:owned-${++nextUrl}`;
        urls.set(url, blob);
        return url;
      },
      revokeObjectURL(url) { urls.delete(url); }
    },
    setTimeout(callback, delay) { timers.push({ callback, delay }); },
    document: {
      getElementById() { return null; },
      createElement(tag) {
        assert.equal(tag, "a");
        return { click() { downloads.push({ href: this.href, filename: this.download }); }, remove() {} };
      },
      body: { append() {} }
    }
  });
  vm.runInContext(source, sandbox);
  return { save: sandbox.saveExposureImage, downloads, sandbox, urls, timers };
}

function downloadHandler(h, state, disabled = false) {
  let handler;
  h.sandbox.state = state;
  h.sandbox.ui = { download: { disabled, addEventListener(type, callback) {
    assert.equal(type, "click");
    handler = callback;
  } } };
  const registration = source.match(/  ui\.download\.addEventListener\("click", \(\) => \{[\s\S]*?\n  \}\);/)?.[0];
  assert.ok(registration);
  vm.runInContext(registration, h.sandbox);
  return handler;
}

test("Save image downloads the exact displayed JPEG on phone, even when native sharing is available", async () => {
  const h = harness({ userAgent: "iPhone", canShare() { throw new Error("Do not share"); },
    share() { throw new Error("Do not share"); } });
  const blob = jpeg(42);
  h.save(blob, "blob:visible", "double-exposure-visible.jpg");
  assert.deepEqual(h.downloads, [{ href: "blob:owned-1", filename: "double-exposure-visible.jpg" }]);
  assert.deepEqual(Buffer.from(await h.urls.get("blob:owned-1").arrayBuffer()), Buffer.from(await blob.arrayBuffer()));
  assert.equal(h.timers.length, 1);
  assert.equal(h.timers[0].delay, 60000);
  h.timers[0].callback();
  assert.equal(h.urls.size, 0);
});

test("Save image downloads on desktop without invoking sharing", () => {
  const h = harness({ userAgent: "Macintosh", canShare() { throw new Error("Do not share"); },
    share() { throw new Error("Do not share"); } });
  h.save(jpeg(1), "blob:desktop", "double-exposure-desktop.jpg");
  assert.deepEqual(h.downloads, [{ href: "blob:owned-1", filename: "double-exposure-desktop.jpg" }]);
});

test("a save click keeps the selected result when a new result replaces it", async () => {
  const h = harness({ userAgent: "iPad", canShare() { throw new Error("Do not share"); } });
  const clickedBlob = jpeg(11);
  const state = { downloadUrl: "blob:old-result", downloadBlob: clickedBlob, displayedSubmissionId: "old-result" };
  h.urls.set(state.downloadUrl, clickedBlob);
  downloadHandler(h, state)();
  h.sandbox.URL.revokeObjectURL(state.downloadUrl);
  state.downloadUrl = "blob:new-result";
  state.downloadBlob = jpeg(22);
  state.displayedSubmissionId = "new-result";
  assert.deepEqual(h.downloads, [{ href: "blob:owned-1", filename: "original-current-double-exposure-program-old-result.jpg" }]);
  assert.deepEqual(Buffer.from(await h.urls.get("blob:owned-1").arrayBuffer()), Buffer.from(await clickedBlob.arrayBuffer()));
});

test("disabled or missing-result save clicks do not download", () => {
  const h = harness({ userAgent: "iPhone" });
  downloadHandler(h, { downloadUrl: "blob:disabled", downloadBlob: jpeg(7) }, true)();
  downloadHandler(h, { downloadUrl: null, downloadBlob: null })();
  assert.deepEqual(h.downloads, []);
});
