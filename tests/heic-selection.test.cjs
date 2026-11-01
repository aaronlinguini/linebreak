"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { File } = require("node:buffer");

const source = fs.readFileSync(path.join(__dirname, "..", "scripts.js"), "utf8");
const sandbox = { Error };
vm.runInNewContext(`${source}\nthis.prepare = prepareParticipantFile;`, sandbox);
const prepare = sandbox.prepare;

test("ordinary photographs and unsupported non-HEIC inputs pass through without loading a decoder", async () => {
  let loads = 0;
  const loadHeic = async () => { loads++; throw new Error("The HEIC module must stay lazy."); };
  for (const [name, type] of [
    ["photo.jpg", "image/jpeg"], ["photo.png", "image/png"], ["photo.webp", "image/webp"],
    ["photo.avif", "image/avif"], ["photo.nef", "application/octet-stream"]
  ]) {
    const file = new File([Uint8Array.from([1, 2, 3])], name, { type });
    assert.strictEqual(await prepare(file, loadHeic), file);
  }
  const largeJpeg = { name: "large.jpg", type: "image/jpeg", size: 30 * 1024 * 1024 + 1 };
  assert.strictEqual(await prepare(largeJpeg, loadHeic), largeJpeg, "existing normal-photo validation still handles its size");
  assert.equal(loads, 0);
});

test("HEIC MIME types and filename extensions route through one normalization and return its exact JPEG file", async () => {
  for (const [name, type] of [
    ["phone.heic", "image/heic"], ["phone.heif", "image/heif"], ["phone.HEIC", ""], ["phone.HEIF", "application/octet-stream"]
  ]) {
    const file = new File([Uint8Array.from([1, 2, 3])], name, { type });
    const jpeg = new File([Uint8Array.from([255, 216, 255, 217])], "phone.jpg", { type: "image/jpeg" });
    let loads = 0;
    let normalized;
    const result = await prepare(file, async () => {
      loads++;
      return { async normalizeHeic(original) { normalized = original; return jpeg; } };
    });
    assert.equal(loads, 1);
    assert.strictEqual(normalized, file);
    assert.strictEqual(result, jpeg, "rendering, hashing and archiving can share this same normalized File");
  }
});

test("an oversized HEIC is rejected before importing the module, and conversion errors propagate", async () => {
  let loads = 0;
  const largeHeic = { name: "large.heic", type: "image/heic", size: 30 * 1024 * 1024 + 1 };
  await assert.rejects(prepare(largeHeic, async () => { loads++; }), /30\s*(?:MB|MiB)|too large|larger/i);
  assert.equal(loads, 0);
  const file = new File([Uint8Array.from([1])], "phone.heic", { type: "image/heic" });
  await assert.rejects(prepare(file, async () => ({ normalizeHeic: async () => { throw new Error("Conversion failed."); } })), /Conversion failed/);
});
