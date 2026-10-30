"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PUBLIC_FILES, OUTPUT_DIRECTORY, preparePublicSite } = require("../scripts/prepare-public-site.cjs");

const project = path.resolve(__dirname, "..");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "exposure-public-package-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const name of PUBLIC_FILES) fs.copyFileSync(path.join(project, name), path.join(root, name));
  return root;
}

function snapshot(root) {
  const directory = path.join(root, OUTPUT_DIRECTORY);
  return Object.fromEntries(fs.readdirSync(directory).map((name) => [name, fs.readFileSync(path.join(directory, name), "utf8")]));
}

test("the publication contains exactly the ten approved public files, byte for byte", (t) => {
  assert.deepEqual([...PUBLIC_FILES].sort(), [
    "index.html", "double-exposure.html", "styles.css", "scripts.js", "project-config.js",
    "archive-workflow.js", "drive-storage.js", "drive-bridge.js", "artist-import.js", "artist-import.css"
  ].sort());
  const root = fixture(t);
  for (const name of ["private-photo.jpg", "local-test.html", ".env", "Code.gs", "Storage.gs", "Artist.html"]) fs.writeFileSync(path.join(root, name), "private");
  fs.mkdirSync(path.join(root, "google-apps-script"));
  fs.writeFileSync(path.join(root, "google-apps-script", "Code.gs"), "private backend");
  fs.mkdirSync(path.join(root, ".git"));
  fs.writeFileSync(path.join(root, ".git", "config"), "private history");
  const destination = preparePublicSite(root);
  assert.equal(destination, path.join(root, OUTPUT_DIRECTORY));
  assert.deepEqual(fs.readdirSync(destination).sort(), [...PUBLIC_FILES].sort());
  for (const name of PUBLIC_FILES) assert.deepEqual(fs.readFileSync(path.join(destination, name)), fs.readFileSync(path.join(root, name)));
  assert.deepEqual(fs.readdirSync(root).filter((name) => name.startsWith(".public-site-stage-")), []);
});

for (const previousCount of [7, 9]) {
  test(`the preceding ${previousCount}-file release upgrades to the ten-file publication`, (t) => {
    const root = fixture(t);
    const destination = preparePublicSite(root);
    const removed = previousCount === 7 ? ["artist-import.js", "artist-import.css", "double-exposure.html"] : ["double-exposure.html"];
    for (const name of removed) fs.unlinkSync(path.join(destination, name));
    assert.equal(fs.readdirSync(destination).length, previousCount);
    preparePublicSite(root);
    assert.deepEqual(fs.readdirSync(destination).sort(), [...PUBLIC_FILES].sort());
  });
}

test("rebuilding replaces the generated version without retaining stale file contents", (t) => {
  const root = fixture(t);
  preparePublicSite(root);
  fs.appendFileSync(path.join(root, "styles.css"), "\n/* publication update */\n");
  preparePublicSite(root);
  assert.equal(snapshot(root)["styles.css"], fs.readFileSync(path.join(root, "styles.css"), "utf8"));
  assert.deepEqual(fs.readdirSync(path.join(root, OUTPUT_DIRECTORY)).sort(), [...PUBLIC_FILES].sort());
});

test("a missing or symlinked source leaves the previous publication intact", (t) => {
  const root = fixture(t);
  preparePublicSite(root);
  const previous = snapshot(root);
  fs.unlinkSync(path.join(root, "styles.css"));
  assert.throws(() => preparePublicSite(root), /ENOENT/);
  assert.deepEqual(snapshot(root), previous);
  fs.writeFileSync(path.join(root, "private.css"), "private");
  fs.symlinkSync(path.join(root, "private.css"), path.join(root, "styles.css"));
  assert.throws(() => preparePublicSite(root), /not a symlink/);
  assert.deepEqual(snapshot(root), previous);
});

test("unexpected destination files and symlinks are never removed", (t) => {
  const root = fixture(t);
  const destination = preparePublicSite(root);
  fs.writeFileSync(path.join(destination, "keep-me.txt"), "do not delete");
  assert.throws(() => preparePublicSite(root), /unexpected files/);
  assert.equal(fs.readFileSync(path.join(destination, "keep-me.txt"), "utf8"), "do not delete");
  fs.unlinkSync(path.join(destination, "keep-me.txt"));
  fs.unlinkSync(path.join(destination, "styles.css"));
  fs.symlinkSync(path.join(root, "styles.css"), path.join(destination, "styles.css"));
  assert.throws(() => preparePublicSite(root), /not a regular generated file/);
  assert.equal(fs.lstatSync(path.join(destination, "styles.css")).isSymbolicLink(), true);
});

test("a symlinked output directory is rejected without touching its target", (t) => {
  const root = fixture(t);
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "exposure-output-target-"));
  t.after(() => fs.rmSync(target, { recursive: true, force: true }));
  fs.writeFileSync(path.join(target, "keep.txt"), "untouched");
  fs.symlinkSync(target, path.join(root, OUTPUT_DIRECTORY));
  assert.throws(() => preparePublicSite(root), /not a file or symlink/);
  assert.equal(fs.readFileSync(path.join(target, "keep.txt"), "utf8"), "untouched");
});

test("a failed installation restores the previous publication", (t) => {
  const root = fixture(t);
  const destination = preparePublicSite(root);
  const previous = snapshot(root);
  const rename = fs.renameSync;
  fs.renameSync = (source, target) => {
    if (source.endsWith(path.sep + "next") && target === destination) throw new Error("simulated installation failure");
    return rename(source, target);
  };
  try { assert.throws(() => preparePublicSite(root), /simulated installation failure/); }
  finally { fs.renameSync = rename; }
  assert.deepEqual(snapshot(root), previous);
  assert.deepEqual(fs.readdirSync(root).filter((name) => name.startsWith(".public-site-stage-")), []);
});

test("inline code, unpublished references and invalid JavaScript fail before replacing output", (t) => {
  const root = fixture(t);
  preparePublicSite(root);
  const previous = snapshot(root);
  for (const page of ["index.html", "double-exposure.html"]) {
    const original = fs.readFileSync(path.join(root, page), "utf8");
    for (const addition of ["<script>alert(1)</script>", "<style>body{}</style>", '<p style="color:red">text</p>', '<button onclick="run()">run</button>', '<script src="local-test.js"></script>', '<a href="GOOGLE-SETUP.md">private notes</a>']) {
      fs.writeFileSync(path.join(root, page), original + addition);
      assert.throws(() => preparePublicSite(root), error => error.message.includes(page) && /external files|unpublished file/.test(error.message));
      assert.deepEqual(snapshot(root), previous);
    }
    fs.writeFileSync(path.join(root, page), original);
  }
  fs.writeFileSync(path.join(root, "scripts.js"), "const = ;");
  assert.throws(() => preparePublicSite(root), SyntaxError);
  assert.deepEqual(snapshot(root), previous);
});
