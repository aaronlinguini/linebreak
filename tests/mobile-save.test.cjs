"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { Blob, File } = require("node:buffer");

const source = fs.readFileSync(path.join(__dirname, "..", "scripts.js"), "utf8");
const phone = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 };
const jpeg = (marker) => new Blob([Uint8Array.from([255, 216, marker, 255, 217])], { type: "image/jpeg" });

function harness(navigator) {
  const downloads = [];
  const urls = new Map();
  const timers = [];
  let nextUrl = 0;
  const sandbox = vm.createContext({ Blob, File, navigator,
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
  } });
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
  assert.ok(registration, "the visible result must have a download click handler");
  vm.runInContext(registration, h.sandbox);
  return handler;
}

test("phone sharing supplies the exact displayed JPEG as a named file before yielding user activation", async () => {
  const shared = [];
  let checkedFile;
  const h = harness({ ...phone,
    canShare({ files }) { checkedFile = files[0]; return true; },
    async share(data) { shared.push(data); }
  });
  const visibleBlob = jpeg(42);
  const saving = h.save(visibleBlob, "blob:visible", "double-exposure-visible.jpg");
  assert.equal(shared.length, 1, "native sharing must start synchronously within the click");
  await saving;
  assert.strictEqual(shared[0].files[0], checkedFile);
  assert.equal(checkedFile.name, "double-exposure-visible.jpg");
  assert.equal(checkedFile.type, "image/jpeg");
  assert.deepEqual(Buffer.from(await checkedFile.arrayBuffer()), Buffer.from(await visibleBlob.arrayBuffer()));
  assert.deepEqual(h.downloads, []);
  assert.deepEqual(Object.keys(shared[0]), ["files"], "share the JPEG itself without a page URL or extra content");
});

test("desktop saving keeps the download link even when native file sharing is available", async () => {
  const h = harness({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", platform: "MacIntel", maxTouchPoints: 0,
    canShare() { throw new Error("Desktop saving must not probe native sharing."); },
    share() { throw new Error("Desktop saving must retain its download behavior."); }
  });
  await h.save(jpeg(1), "blob:desktop", "double-exposure-desktop.jpg");
  assert.deepEqual(h.downloads, [{ href: "blob:desktop", filename: "double-exposure-desktop.jpg" }]);
  assert.equal(h.urls.size, 0);
  assert.deepEqual(h.timers, []);
});

test("unsupported phone sharing and failed capability probes retain the existing download fallback", async () => {
  for (const navigator of [undefined, phone, { ...phone, canShare: () => false, share() {} },
    { ...phone, canShare() { throw new TypeError("Unsupported files."); }, share() {} }]) {
    const h = harness(navigator);
    await h.save(jpeg(2), "blob:download", "double-exposure-fallback.jpg");
    assert.deepEqual(h.downloads, [{ href: "blob:download", filename: "double-exposure-fallback.jpg" }]);
  }
});

test("cancelling a native share sheet never starts a download", async () => {
  const h = harness({ ...phone, canShare: () => true,
    async share() { throw Object.assign(new Error("Cancelled."), { name: "AbortError" }); }
  });
  await h.save(jpeg(3), "blob:cancelled", "double-exposure-cancelled.jpg");
  assert.deepEqual(h.downloads, []);
  assert.equal(h.urls.size, 0);
  assert.deepEqual(h.timers, []);
});

test("a native sharing failure downloads the captured JPEG using its own temporary URL", async () => {
  const h = harness({ ...phone, canShare: () => true,
    async share() { throw Object.assign(new Error("Sharing blocked."), { name: "NotAllowedError" }); }
  });
  const blob = jpeg(4);
  await h.save(blob, "blob:failed-share", "double-exposure-failed-share.jpg");
  assert.deepEqual(h.downloads, [{ href: "blob:owned-1", filename: "double-exposure-failed-share.jpg" }]);
  assert.strictEqual(h.urls.get("blob:owned-1"), blob);
});

test("a delayed share failure keeps the clicked JPEG after the visible result URL is revoked", async () => {
  let rejectShare;
  const h = harness({ ...phone, canShare: () => true,
    share() { return new Promise((_, reject) => { rejectShare = reject; }); }
  });
  const clickedBlob = jpeg(11);
  const state = { downloadUrl: "blob:old-result", downloadBlob: clickedBlob, displayedSubmissionId: "old-result" };
  h.urls.set(state.downloadUrl, clickedBlob);
  const saving = downloadHandler(h, state)();
  h.sandbox.URL.revokeObjectURL(state.downloadUrl);
  state.downloadUrl = "blob:new-result";
  state.downloadBlob = jpeg(22);
  state.displayedSubmissionId = "new-result";
  rejectShare(Object.assign(new Error("Native sharing failed."), { name: "NotAllowedError" }));
  await saving;
  assert.deepEqual(h.downloads, [{ href: "blob:owned-1", filename: "double-exposure-old-result.jpg" }]);
  const fallback = h.urls.get(h.downloads[0].href);
  assert.ok(fallback, "the download must have a live URL after the display releases its URL");
  assert.deepEqual(Buffer.from(await fallback.arrayBuffer()), Buffer.from(await clickedBlob.arrayBuffer()));
  assert.equal(h.timers.length, 1, "the fallback URL must eventually be released");
  assert.ok(h.timers[0].delay >= 1000, "release must leave time for the browser to start consuming the download");
  h.timers[0].callback();
  assert.equal(h.urls.has(h.downloads[0].href), false);
});

test("cancelling a pending share after clearing the result creates no fallback URL or download", async () => {
  let rejectShare;
  const h = harness({ ...phone, canShare: () => true,
    share() { return new Promise((_, reject) => { rejectShare = reject; }); }
  });
  const state = { downloadUrl: "blob:old-result", downloadBlob: jpeg(33), displayedSubmissionId: "old-result" };
  h.urls.set(state.downloadUrl, state.downloadBlob);
  const saving = downloadHandler(h, state)();
  h.sandbox.URL.revokeObjectURL(state.downloadUrl);
  state.downloadUrl = null;
  state.downloadBlob = null;
  rejectShare(Object.assign(new Error("Cancelled."), { name: "AbortError" }));
  await saving;
  assert.deepEqual(h.downloads, []);
  assert.equal(h.urls.size, 0);
  assert.deepEqual(h.timers, []);
});

test("iPad desktop identification still opens native JPEG sharing", async () => {
  let shared;
  const h = harness({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", platform: "MacIntel", maxTouchPoints: 5,
    canShare: () => true, async share(data) { shared = data; }
  });
  await h.save(jpeg(5), "blob:ipad", "double-exposure-ipad.jpg");
  assert.equal(shared.files[0].name, "double-exposure-ipad.jpg");
  assert.deepEqual(h.downloads, []);
});

test("an enabled save click captures the current rotated or colour JPEG", async () => {
  for (const mode of ["original", "monochrome", "rotated"]) {
    let shared;
    const h = harness({ ...phone, canShare: () => true, async share(data) { shared = data; } });
    const archivedBlob = jpeg(1);
    const displayedBlob = jpeg(mode.length);
    const state = { downloadUrl: `blob:${mode}`, downloadBlob: displayedBlob, displayedSubmissionId: mode,
      displayedResult: { result: { blob: archivedBlob } }, previewing: true };
    const saving = downloadHandler(h, state)();
    assert.ok(shared, "the click itself must invoke native sharing without awaiting a receipt or reading pixels");
    state.downloadBlob = archivedBlob;
    state.downloadUrl = "blob:newer-result";
    state.displayedSubmissionId = "newer-result";
    await saving;
    assert.equal(shared.files[0].name, `double-exposure-${mode}.jpg`);
    assert.deepEqual(Buffer.from(await shared.files[0].arrayBuffer()), Buffer.from(await displayedBlob.arrayBuffer()));
    assert.deepEqual(h.downloads, []);
  }
});

test("disabled or missing-result download clicks do not open native sharing or a download", async () => {
  const h = harness({ ...phone, canShare() { throw new Error("No save should be attempted."); }, share() {} });
  await downloadHandler(h, { downloadUrl: "blob:disabled", downloadBlob: jpeg(7) }, true)();
  await downloadHandler(h, { downloadUrl: null, downloadBlob: null })();
  assert.deepEqual(h.downloads, []);
});
