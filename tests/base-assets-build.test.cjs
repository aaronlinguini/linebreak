"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const { buildBaseAssets, MAX_PHOTO_BYTES } = require("../scripts/build-base-assets.cjs");

const jpeg = marker => Buffer.from([255, 216, 255, marker, 255, 217]);
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const webp = Buffer.from("RIFF1234WEBPtest");
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const manifestPath = root => path.join(root, "assets", "base-photos.json");
const catalogPath = root => path.join(root, "google-apps-script", "AssetCatalog.gs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "exposure-base-assets-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "assets", "base-photos"), { recursive: true });
  fs.mkdirSync(path.join(root, "google-apps-script"));
  return { root, photo: (name, bytes) => fs.writeFileSync(path.join(root, "assets", "base-photos", name), bytes) };
}

function outputs(root) {
  return [fs.readFileSync(manifestPath(root)), fs.readFileSync(catalogPath(root))];
}

test("builds a deterministic public manifest and identical executable private catalog without altering photos", t => {
  const { root, photo } = fixture(t);
  const name = "été #1 ? 50% 'quoted'.JPG";
  photo("z.png", png); photo(name, jpeg(2)); photo("A.webp", webp);
  const before = fs.readFileSync(path.join(root, "assets", "base-photos", name));
  const result = buildBaseAssets({ root });
  assert.deepEqual(result, { version: 1, photos: [
    { path: "assets/base-photos/A.webp", name: "A.webp", sha256: sha256(webp), mimeType: "image/webp", byteLength: webp.length },
    { path: "assets/base-photos/z.png", name: "z.png", sha256: sha256(png), mimeType: "image/png", byteLength: png.length },
    { path: `assets/base-photos/${name}`, name, sha256: sha256(jpeg(2)), mimeType: "image/jpeg", byteLength: jpeg(2).length }
  ] });
  assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath(root), "utf8")), result);
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(catalogPath(root), "utf8"), sandbox);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.artistAssetCatalog_())), result);
  assert.deepEqual(fs.readFileSync(path.join(root, "assets", "base-photos", name)), before);
  const generated = outputs(root);
  buildBaseAssets({ root });
  assert.deepEqual(outputs(root), generated);
  assert.deepEqual(fs.readdirSync(path.join(root, "assets", "base-photos")).sort(), ["A.webp", "z.png", name].sort());
});

test("duplicate byte sequences keep the first stable filename but do not delete or rename either original", t => {
  const { root, photo } = fixture(t);
  photo("z.jpeg", jpeg(1)); photo("A.jpg", jpeg(1)); photo("different.jpg", jpeg(2)); photo(".DS_Store", "Finder data");
  const result = buildBaseAssets({ root });
  assert.deepEqual(result.photos.map(item => item.name), ["A.jpg", "different.jpg"]);
  assert.equal(result.photos.length, 2);
  assert.deepEqual(fs.readFileSync(path.join(root, "assets", "base-photos", "z.jpeg")), jpeg(1));
  assert.equal(fs.readdirSync(path.join(root, "assets", "base-photos")).length, 4);
});

test("AVIF accepts a complete compatible-brand box beyond the initial header", t => {
  const { root, photo } = fixture(t);
  const avif = Buffer.alloc(128);
  avif.writeUInt32BE(96, 0); avif.write("ftyp", 4); avif.write("isom", 8); avif.write("avif", 80);
  photo("image.avif", avif);
  const result = buildBaseAssets({ root });
  assert.equal(result.photos[0].mimeType, "image/avif");
  assert.equal(result.photos[0].sha256, sha256(avif));
  avif.writeUInt32BE(200, 0);
  photo("image.avif", avif);
  assert.throws(() => buildBaseAssets({ root }), /signature/);
});

test("empty folders and invalid inputs preserve both previous generated outputs", t => {
  for (const [name, bytes] of [["empty.jpg", Buffer.alloc(0)], ["wrong.jpg", png], ["notes.txt", jpeg(1)],
    ["fake.png", jpeg(1)], ["fake.webp", jpeg(1)], ["fake.avif", jpeg(1)], ["line\nbreak.jpg", jpeg(1)],
    ["back\\slash.jpg", jpeg(1)], ["control\u0085.jpg", jpeg(1)]]) {
    const { root, photo } = fixture(t);
    photo("good.jpg", jpeg(1));
    buildBaseAssets({ root });
    const before = outputs(root);
    photo(name, bytes);
    assert.throws(() => buildBaseAssets({ root }), /signature|Unsupported|between|Unsafe/);
    assert.deepEqual(outputs(root), before, name);
  }
  const { root } = fixture(t);
  fs.writeFileSync(manifestPath(root), "previous public manifest");
  fs.writeFileSync(catalogPath(root), "previous private catalog");
  const before = outputs(root);
  assert.throws(() => buildBaseAssets({ root }), /Add at least one/);
  assert.deepEqual(outputs(root), before);
});

test("oversized files are rejected before reading or replacing outputs", t => {
  const { root, photo } = fixture(t);
  photo("good.jpg", jpeg(1)); buildBaseAssets({ root });
  const before = outputs(root);
  photo("large.jpg", jpeg(2));
  fs.truncateSync(path.join(root, "assets", "base-photos", "large.jpg"), MAX_PHOTO_BYTES + 1);
  assert.throws(() => buildBaseAssets({ root }), /30 MiB/);
  assert.deepEqual(outputs(root), before);
});

test("symlinks, nested folders and nonfiles cannot become photo assets", t => {
  for (const kind of ["symlink", "directory", "fifo"]) {
    const { root, photo } = fixture(t);
    photo("good.jpg", jpeg(1)); buildBaseAssets({ root });
    const before = outputs(root);
    const bad = path.join(root, "assets", "base-photos", "nested.jpg");
    if (kind === "symlink") fs.symlinkSync(path.join(root, "assets", "base-photos", "good.jpg"), bad);
    else if (kind === "directory") fs.mkdirSync(bad);
    else {
      const created = spawnSync("mkfifo", [bad]);
      assert.equal(created.status, 0);
    }
    assert.throws(() => buildBaseAssets({ root }), /regular file/);
    assert.deepEqual(outputs(root), before);
  }
});

test("symlinked input parents and generated destinations are rejected without touching their targets", t => {
  const { root, photo } = fixture(t);
  photo("good.jpg", jpeg(1));
  const outside = path.join(root, "keep.txt"); fs.writeFileSync(outside, "keep");
  fs.symlinkSync(outside, catalogPath(root));
  assert.throws(() => buildBaseAssets({ root }), /regular file/);
  assert.equal(fs.existsSync(manifestPath(root)), false);
  assert.equal(fs.readFileSync(outside, "utf8"), "keep");
  fs.unlinkSync(catalogPath(root));
  const directory = path.join(root, "assets", "base-photos");
  fs.renameSync(directory, path.join(root, "selected"));
  fs.symlinkSync(path.join(root, "selected"), directory);
  assert.throws(() => buildBaseAssets({ root }), /real directory/);
});

test("check mode verifies both outputs and selected bytes without writing", t => {
  const { root, photo } = fixture(t);
  photo("image.jpg", jpeg(1));
  assert.throws(() => buildBaseAssets({ root, check: true }), /does not match/);
  assert.equal(fs.existsSync(manifestPath(root)), false);
  assert.equal(fs.existsSync(catalogPath(root)), false);
  buildBaseAssets({ root });
  const before = outputs(root);
  const times = [fs.statSync(manifestPath(root)).mtimeMs, fs.statSync(catalogPath(root)).mtimeMs];
  assert.equal(buildBaseAssets({ root, check: true }).photos.length, 1);
  assert.deepEqual(outputs(root), before);
  assert.deepEqual([fs.statSync(manifestPath(root)).mtimeMs, fs.statSync(catalogPath(root)).mtimeMs], times);
  photo("image.jpg", jpeg(2));
  assert.throws(() => buildBaseAssets({ root, check: true }), /does not match/);
  assert.deepEqual(outputs(root), before);
  photo("image.jpg", jpeg(1));
  fs.appendFileSync(catalogPath(root), "changed");
  assert.throws(() => buildBaseAssets({ root, check: true }), /AssetCatalog.gs does not match/);
  assert.deepEqual(fs.readFileSync(manifestPath(root)), before[0]);
});

test("a failed second replacement restores both prior outputs and removes temporary files", t => {
  const { root, photo } = fixture(t);
  photo("first.jpg", jpeg(1)); buildBaseAssets({ root });
  const before = outputs(root);
  photo("second.jpg", jpeg(2));
  const rename = fs.renameSync;
  let failed = false;
  fs.renameSync = (from, to) => {
    if (!failed && to === catalogPath(root)) { failed = true; throw new Error("simulated write failure"); }
    return rename(from, to);
  };
  try { assert.throws(() => buildBaseAssets({ root }), /simulated write failure/); }
  finally { fs.renameSync = rename; }
  assert.deepEqual(outputs(root), before);
  for (const directory of ["assets", "google-apps-script"]) {
    assert.equal(fs.readdirSync(path.join(root, directory)).some(name => name.includes(".tmp-")), false);
  }
});
