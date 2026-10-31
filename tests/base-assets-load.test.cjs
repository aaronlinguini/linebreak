"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { File } = require("node:buffer");
const { createHash, webcrypto } = require("node:crypto");
const source = fs.readFileSync(path.join(__dirname, "..", "base-assets.js"), "utf8");
const bytes = Uint8Array.from([255, 216, 255, 20, 30, 40]);
const hash = value => createHash("sha256").update(value).digest("hex");
const base = (name = "base.jpg", content = bytes) => ({
  id: "artist-1", name, path: "assets/base-photos/" + name,
  sha256: hash(content), mimeType: "image/jpeg", byteLength: content.length
});

function fixture(fetch = async () => new Response(bytes), baseURI = "http://127.0.0.1:5500/artwork/double-exposure.html") {
  const calls = [];
  const sandbox = { URL, File, Blob, Uint8Array, AbortController, crypto: webcrypto, setTimeout, clearTimeout,
    document: { baseURI }, window: { location: { origin: "http://127.0.0.1:5500" } },
    fetch: async (...args) => { calls.push(args); return fetch(...args); } };
  vm.runInNewContext(source + "\nthis.assets = ExposureBaseAssets;", sandbox);
  return { assets: sandbox.assets, calls };
}

test("loads the exact artist file directly from this site's assets, including literal reserved filename characters", async () => {
  const h = fixture();
  const descriptor = base("skull #1 ? 50% é.JPG");
  const file = await h.assets.loadFile(descriptor);
  assert.equal(file.name, descriptor.name);
  assert.equal(file.type, descriptor.mimeType);
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
  const [url, options] = h.calls[0];
  const parsed = new URL(url);
  assert.equal(parsed.pathname, "/artwork/assets/base-photos/" + encodeURIComponent(descriptor.name));
  assert.equal(parsed.searchParams.get("v"), descriptor.sha256);
  assert.equal(parsed.hash, "");
  assert.equal(options.redirect, "error");
  assert.equal(options.credentials, "same-origin");
});

test("reuses a verified download for colour changes and concurrent requests", async () => {
  let finish;
  const h = fixture(() => new Promise(resolve => { finish = () => resolve(new Response(bytes)); }));
  const first = h.assets.loadFile(base());
  const second = h.assets.loadFile(base());
  assert.equal(h.calls.length, 1);
  finish();
  const files = await Promise.all([first, second]);
  assert.equal(files[0].size, bytes.length);
  assert.equal(files[1].size, bytes.length);
  const third = await h.assets.loadFile(base());
  assert.equal(third.size, bytes.length);
  assert.equal(h.calls.length, 1);
});

test("a changed asset fails verification and is not cached as a successful download", async () => {
  let attempts = 0;
  const h = fixture(async () => new Response(++attempts === 1 ? Uint8Array.from([1, 2, 3, 4, 5, 6]) : bytes));
  await assert.rejects(h.assets.loadFile(base()), /saved version/);
  const file = await h.assets.loadFile(base());
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
  assert.equal(h.calls.length, 2);
});

test("rejects incorrect lengths, oversized streams and failed responses", async () => {
  for (const response of [
    () => new Response(bytes, { headers: { "content-length": "999" } }),
    () => new Response(bytes.subarray(0, 3)),
    () => new Response(new Uint8Array(bytes.length + 1)),
    () => new Response("missing", { status: 404 })
  ]) {
    const h = fixture(async () => response());
    await assert.rejects(h.assets.loadFile(base()), /changed|completely|loaded/);
  }
});

test("rejects unsafe descriptors before contacting the server and cannot follow a different site base", async () => {
  const h = fixture();
  for (const invalid of [
    { path: "https://other.example/photo.jpg" },
    { path: "assets/base-photos/../photo.jpg", name: "../photo.jpg" },
    { path: "assets/base-photos/a\\b.jpg", name: "a\\b.jpg" },
    { path: "assets/base-photos/a\nb.jpg", name: "a\nb.jpg" },
    { path: "assets/base-photos/..", name: ".." },
    { byteLength: 31 * 1024 * 1024 },
    { byteLength: 0 },
    { mimeType: "text/html" },
    { sha256: "unknown" },
    { base64: "AA==" },
    { name: "another-name.jpg" }
  ]) await assert.rejects(h.assets.loadFile({ ...base(), ...invalid }), /invalid/);
  assert.equal(h.calls.length, 0);
  const remote = fixture(undefined, "https://other.example/");
  await assert.rejects(remote.assets.loadFile(base()), /this website/);
  assert.equal(remote.calls.length, 0);
});

test("keeps at most two recently used asset downloads", async () => {
  const content = [bytes, Uint8Array.from([1, 2]), Uint8Array.from([3, 4])];
  const descriptors = content.map((value, index) => base(index + ".jpg", value));
  const h = fixture(async url => {
    const entry = descriptors.find(item => new URL(url).searchParams.get("v") === item.sha256);
    return new Response(content[descriptors.indexOf(entry)]);
  });
  await h.assets.loadFile(descriptors[0]);
  await h.assets.loadFile(descriptors[1]);
  await h.assets.loadFile(descriptors[0]);
  await h.assets.loadFile(descriptors[2]);
  await h.assets.loadFile(descriptors[0]);
  assert.equal(h.calls.length, 3);
  await h.assets.loadFile(descriptors[1]);
  assert.equal(h.calls.length, 4);
});
