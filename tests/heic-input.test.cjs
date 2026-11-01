"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { File } = require("node:buffer");
const { webcrypto } = require("node:crypto");

const source = fs.readFileSync(path.join(__dirname, "..", "heic-input.js"), "utf8");
const jpegBytes = Uint8Array.from([255, 216, 255, 224, 1, 2, 3, 255, 217]);
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
};

function heicFile(name = "phone.heic", serial = 1, brand = "heic") {
  const bytes = Buffer.alloc(32);
  bytes.writeUInt32BE(bytes.length, 0);
  bytes.write("ftyp", 4);
  bytes.write(brand, 8);
  bytes.write(brand, 16);
  bytes.writeUInt32BE(serial, 28);
  return new File([bytes], name, { type: "image/heic" });
}

function harness({ nativeFails = false, nativeSize = { width: 4000, height: 3000 },
  bitmapSize = { width: 1200, height: 800 }, output = new Blob([jpegBytes], { type: "image/jpeg" }) } = {}) {
  const calls = { images: [], decoderLoads: 0, decoderRequests: [], bitmaps: [], draws: [], encodings: [], urls: [], revoked: [] };
  const timers = new Map();
  let serial = 0;
  let nativeGate;
  let decoderGate;
  let decoderError;
  let encoded = output;
  const sandbox = {
    Error, Blob, File, crypto: webcrypto,
    setTimeout(callback, delay) { const id = ++serial; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    URL: {
      createObjectURL(file) { const url = `blob:heic-${calls.urls.length + 1}`; calls.urls.push({ url, file }); return url; },
      revokeObjectURL(url) { calls.revoked.push(url); }
    },
    Image: class {
      constructor() {
        this.naturalWidth = this.width = nativeSize.width;
        this.naturalHeight = this.height = nativeSize.height;
        calls.images.push(this);
      }
      async decode() {
        if (nativeGate) await nativeGate;
        if (nativeFails) throw new Error("Native HEIC decoding is unavailable.");
      }
    },
    document: {
      createElement(tag) {
        assert.equal(tag, "canvas");
        const canvas = { width: 0, height: 0 };
        canvas.getContext = () => ({
          fillRect() {},
          drawImage(image, ...coordinates) { calls.draws.push({ image, coordinates, width: canvas.width, height: canvas.height }); }
        });
        canvas.toBlob = (callback, type, quality) => {
          calls.encodings.push({ type, quality, width: canvas.width, height: canvas.height });
          queueMicrotask(() => callback(encoded));
        };
        return canvas;
      }
    }
  };
  vm.runInNewContext(`${source.replace(/^export\s+/gm, "")}\nthis.normalizeForTest = normalizeHeic;`, sandbox);
  const loadDecoder = async () => {
    calls.decoderLoads++;
    return {
      async heicTo(request) {
        calls.decoderRequests.push(request);
        if (decoderGate) await decoderGate;
        if (decoderError) throw decoderError;
        const bitmap = { ...bitmapSize, closed: 0, close() { this.closed++; } };
        calls.bitmaps.push(bitmap);
        return bitmap;
      }
    };
  };
  return {
    calls, timers,
    normalize(file) { return sandbox.normalizeForTest(file, { loadDecoder }); },
    blockNative(gate) { nativeGate = gate; },
    blockDecoder(gate) { decoderGate = gate; },
    failDecoder(error) { decoderError = error; },
    encode(blob) { encoded = blob; }
  };
}

test("JPEG bytes retain their identity, or receive only a JPEG File wrapper when mislabeled", async () => {
  const h = harness();
  const jpeg = new File([jpegBytes], "already.jpg", { type: "image/jpeg" });
  assert.strictEqual(await h.normalize(jpeg), jpeg);
  const mislabeled = new File([jpegBytes], "phone.HEIC", { type: "image/heic" });
  const result = await h.normalize(mislabeled);
  assert.equal(result.type, "image/jpeg");
  assert.match(result.name, /\.jpe?g$/i);
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), jpegBytes);
  assert.equal(h.calls.images.length, 0);
  assert.equal(h.calls.decoderLoads, 0);
});

test("native HEIC decoding preserves dimensions and encodes JPEG without loading the fallback decoder", async () => {
  const h = harness();
  const result = await h.normalize(heicFile());
  assert.equal(result.type, "image/jpeg");
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), jpegBytes);
  assert.equal(h.calls.images.length, 1);
  assert.equal(h.calls.decoderLoads, 0);
  assert.deepEqual(h.calls.encodings, [{ type: "image/jpeg", quality: 0.97, width: 4000, height: 3000 }]);
  assert.strictEqual(h.calls.draws[0].image, h.calls.images[0]);
  assert.deepEqual(h.calls.revoked, h.calls.urls.map(({ url }) => url));
  assert.equal(h.timers.size, 0);
});

test("the fallback decoder loads only after native decoding fails and releases its bitmap", async () => {
  const h = harness({ nativeFails: true });
  const file = heicFile("phone.heif", 1, "mif1");
  const result = await h.normalize(file);
  assert.equal(result.type, "image/jpeg");
  assert.equal(h.calls.decoderLoads, 1);
  assert.equal(h.calls.decoderRequests.length, 1);
  assert.strictEqual(h.calls.decoderRequests[0].blob, file);
  assert.equal(h.calls.decoderRequests[0].type, "bitmap");
  assert.deepEqual(h.calls.encodings, [{ type: "image/jpeg", quality: 0.97, width: 1200, height: 800 }]);
  assert.strictEqual(h.calls.draws[0].image, h.calls.bitmaps[0]);
  assert.equal(h.calls.bitmaps[0].closed, 1);
  assert.deepEqual(h.calls.revoked, h.calls.urls.map(({ url }) => url));
});

test("same-byte HEIC inputs share in-flight conversion and the bounded cache preserves each upload name", async () => {
  const h = harness();
  const gate = deferred();
  h.blockNative(gate.promise);
  const original = heicFile("first.heic");
  const renamed = new File([await original.arrayBuffer()], "second.heif", { type: "image/heif" });
  const first = h.normalize(original);
  const second = h.normalize(renamed);
  for (let attempt = 0; attempt < 20 && !h.calls.images.length; attempt++) await flush();
  assert.equal(h.calls.images.length, 1);
  gate.resolve();
  const [a, b] = await Promise.all([first, second]);
  assert.match(a.name, /^first\./);
  assert.match(b.name, /^second\./);
  assert.deepEqual(new Uint8Array(await a.arrayBuffer()), new Uint8Array(await b.arrayBuffer()));
  assert.equal(h.calls.encodings.length, 1);
  await h.normalize(renamed);
  assert.equal(h.calls.encodings.length, 1, "a completed same-byte conversion is reused");
  await h.normalize(heicFile("third.heic", 2));
  await h.normalize(heicFile("fourth.heic", 3));
  await h.normalize(original);
  assert.equal(h.calls.encodings.length, 4, "only the last two converted byte sequences remain cached");
});

test("invalid headers, AVIF brands and oversized originals fail before native or fallback decoding", async () => {
  const h = harness();
  const invalid = new File([Uint8Array.from([1, 2, 3])], "wrong.heic", { type: "image/heic" });
  for (const file of [invalid, heicFile("avif.heic", 1, "avif"), heicFile("sequence.heic", 1, "avis"),
    { name: "large.heic", type: "image/heic", size: 30 * 1024 * 1024 + 1 }]) {
    await assert.rejects(h.normalize(file), /HEIC|HEIF|format|30\s*(?:MB|MiB)|large|supported/i);
  }
  assert.equal(h.calls.images.length, 0);
  assert.equal(h.calls.decoderLoads, 0);
});

test("dimension limits and encoding failures cannot be bypassed with the fallback decoder", async () => {
  for (const nativeSize of [{ width: 0, height: 100 }, { width: 10000, height: 9000 }]) {
    const h = harness({ nativeSize });
    await assert.rejects(h.normalize(heicFile()), /dimension|large|size|pixel|read/i);
    assert.equal(h.calls.decoderLoads, 0);
  }
  const h = harness({ output: null });
  await assert.rejects(h.normalize(heicFile()), /JPEG|convert|creat|encod/i);
  assert.equal(h.calls.decoderLoads, 0);
});

test("invalid JPEG output and fallback dimension or encoding failures release every decoded bitmap", async () => {
  const invalidOutput = new Blob([Uint8Array.from([137, 80, 78, 71])], { type: "image/jpeg" });
  for (const options of [
    { output: invalidOutput }, { output: new Blob([], { type: "image/jpeg" }) },
    { bitmapSize: { width: 0, height: 800 } }, { bitmapSize: { width: 10000, height: 9000 } }, { output: null }
  ]) {
    const h = harness({ nativeFails: true, ...options });
    await assert.rejects(h.normalize(heicFile()), /JPEG|convert|creat|encod|dimension|large|size|pixel|read/i);
    assert.ok(h.calls.bitmaps.length > 0);
    assert.ok(h.calls.bitmaps.every(bitmap => bitmap.closed === 1));
  }
  const bytes = new Uint8Array(30 * 1024 * 1024 + 1);
  bytes.set(jpegBytes);
  const h = harness({ nativeFails: true, output: new Blob([bytes], { type: "image/jpeg" }) });
  await assert.rejects(h.normalize(heicFile()), /30\s*(?:MB|MiB)|large|size/i);
  assert.equal(h.calls.bitmaps[0].closed, 1);
});

test("failed conversions do not poison later attempts for the same raw bytes", async () => {
  const h = harness({ nativeFails: true });
  const file = heicFile();
  h.failDecoder(new Error("Decoder failed."));
  await assert.rejects(h.normalize(file), /Decoder failed|convert|HEIC/i);
  h.failDecoder(null);
  const result = await h.normalize(file);
  assert.equal(result.type, "image/jpeg");
  assert.equal(h.calls.decoderRequests.length, 2);
  assert.equal(h.calls.bitmaps[0].closed, 1);
});

test("a 120-second decode deadline rejects stalled native or fallback work and cleans up late bitmaps", async () => {
  for (const nativeFails of [false, true]) {
    const h = harness({ nativeFails });
    const gate = deferred();
    if (nativeFails) h.blockDecoder(gate.promise);
    else h.blockNative(gate.promise);
    const converting = h.normalize(heicFile());
    const rejected = assert.rejects(converting, /time|long|120|minute/i);
    for (let attempt = 0; attempt < 30; attempt++) {
      if (h.timers.size && (nativeFails ? h.calls.decoderRequests.length : h.calls.images.length)) break;
      await flush();
    }
    const deadline = [...h.timers.values()].find(timer => timer.delay === 120000);
    assert.ok(deadline, "conversion must have a bounded decode deadline");
    deadline.callback();
    await rejected;
    gate.resolve();
    await flush();
    assert.equal(h.timers.size, 0);
    assert.deepEqual(h.calls.revoked, h.calls.urls.map(({ url }) => url));
    assert.ok(h.calls.bitmaps.every(bitmap => bitmap.closed === 1));
  }
});
