"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { PUBLIC_FILES, OUTPUT_DIRECTORY, preparePublicSite } = require("../scripts/prepare-public-site.cjs");

const project = path.resolve(__dirname, "..");
const catalogueFile = "assets/base-photos.json";
const heicFiles = ["heic-input.js", "vendor/heic-to/heic-to.js", "vendor/heic-to/LICENSE",
  "vendor/heic-to/NOTICE.txt", "vendor/heic-to/SOURCES.tar.gz"];
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1]);
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 2]);

function writePhotos(root, photos = [
  { name: "café #1? 100%.jpg", mimeType: "image/jpeg", bytes: jpeg },
  { name: "strip.png", mimeType: "image/png", bytes: png }
]) {
  fs.mkdirSync(path.join(root, "assets", "base-photos"), { recursive: true });
  const entries = photos.map(({ name, mimeType, bytes }) => {
    const filename = `assets/base-photos/${name}`;
    fs.writeFileSync(path.join(root, filename), bytes);
    return { path: filename, name, mimeType, byteLength: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex") };
  });
  fs.writeFileSync(path.join(root, catalogueFile), JSON.stringify({ version: 1, photos: entries }));
  return entries;
}

function catalogue(root) {
  return JSON.parse(fs.readFileSync(path.join(root, catalogueFile), "utf8"));
}

function expectedFiles(root) {
  return [...PUBLIC_FILES, ...catalogue(root).photos.map((photo) => photo.path)].sort();
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "exposure-public-package-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const name of PUBLIC_FILES) {
    if (name === catalogueFile) continue;
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.copyFileSync(path.join(project, name), path.join(root, name));
  }
  writePhotos(root);
  return root;
}

function snapshot(root) {
  const directory = path.join(root, OUTPUT_DIRECTORY);
  const files = {};
  function visit(relative = "") {
    for (const name of fs.readdirSync(path.join(directory, relative))) {
      const filename = relative ? `${relative}/${name}` : name;
      if (fs.lstatSync(path.join(directory, filename)).isDirectory()) visit(filename);
      else files[filename] = fs.readFileSync(path.join(directory, filename));
    }
  }
  visit();
  return files;
}

test("publication contains only the twenty core files and manifest-listed photographs, byte for byte", (t) => {
  assert.deepEqual([...PUBLIC_FILES].sort(), [
    "index.html", "double-exposure.html", "styles.css", "scripts.js", "project-config.js",
    "archive-workflow.js", "drive-storage.js", "drive-bridge.js", "artist-import.js", "artist-import.css",
    "experiment-1.html", "experiment-2.html", "experiment-3.html", "base-assets.js", catalogueFile,
    "heic-input.js", "vendor/heic-to/heic-to.js", "vendor/heic-to/LICENSE",
    "vendor/heic-to/NOTICE.txt", "vendor/heic-to/SOURCES.tar.gz"
  ].sort());
  const root = fixture(t);
  for (const name of ["private-photo.jpg", "local-test.html", ".env", "README.md", "AGENTS.md", "Code.gs", "Storage.gs", "Artist.html"]) fs.writeFileSync(path.join(root, name), "private");
  fs.mkdirSync(path.join(root, "google-apps-script"));
  fs.writeFileSync(path.join(root, "google-apps-script", "Code.gs"), "private backend");
  fs.mkdirSync(path.join(root, ".git"));
  fs.writeFileSync(path.join(root, ".git", "config"), "private history");
  fs.mkdirSync(path.join(root, "images", "experiment-1"), { recursive: true });
  fs.writeFileSync(path.join(root, "images", "experiment-1", "private.jpg"), jpeg);
  fs.writeFileSync(path.join(root, "assets", "base-photos", "unlisted-duplicate.jpg"), jpeg);
  fs.writeFileSync(path.join(root, "assets", "base-photos", "README.md"), "private authoring notes");
  fs.writeFileSync(path.join(root, "vendor", "heic-to", "unlisted-notes.txt"), "not selected for publication");
  const destination = preparePublicSite(root);
  assert.equal(destination, path.join(root, OUTPUT_DIRECTORY));
  assert.deepEqual(Object.keys(snapshot(root)).sort(), expectedFiles(root));
  for (const name of expectedFiles(root)) assert.deepEqual(fs.readFileSync(path.join(destination, name)), fs.readFileSync(path.join(root, name)));
  assert.deepEqual(fs.readdirSync(root).filter((name) => name.startsWith(".public-site-stage-")), []);
});

for (const previousCount of [7, 9, 10, 13]) {
  test(`the preceding ${previousCount}-file release upgrades to the manifest-listed publication`, (t) => {
    const root = fixture(t);
    const destination = preparePublicSite(root);
    const removed = [
      "heic-input.js", "vendor", "base-assets.js", "assets",
      ...(previousCount < 13 ? ["experiment-1.html", "experiment-2.html", "experiment-3.html"] : []),
      ...(previousCount < 10 ? ["double-exposure.html"] : []),
      ...(previousCount === 7 ? ["artist-import.js", "artist-import.css"] : [])
    ];
    for (const name of removed) fs.rmSync(path.join(destination, name), { recursive: true });
    assert.equal(fs.readdirSync(destination).length, previousCount);
    preparePublicSite(root);
    assert.deepEqual(Object.keys(snapshot(root)).sort(), expectedFiles(root));
  });
}

test("the preceding fifteen-core-file static release upgrades without losing its selected photographs", (t) => {
  const root = fixture(t);
  const destination = preparePublicSite(root);
  fs.unlinkSync(path.join(destination, "heic-input.js"));
  fs.rmSync(path.join(destination, "vendor"), { recursive: true });
  const previous = snapshot(root);
  assert.deepEqual(Object.keys(previous).sort(), expectedFiles(root).filter(name => !heicFiles.includes(name)));
  preparePublicSite(root);
  assert.deepEqual(Object.keys(snapshot(root)).sort(), expectedFiles(root));
  for (const photo of catalogue(root).photos) assert.deepEqual(fs.readFileSync(path.join(destination, photo.path)), previous[photo.path]);
});

test("partial converter or vendor output is never mistaken for an older generated release", (t) => {
  for (const missing of ["heic-input.js", "vendor/heic-to/LICENSE", "vendor/heic-to/SOURCES.tar.gz"]) {
    const root = fixture(t);
    const destination = preparePublicSite(root);
    fs.unlinkSync(path.join(destination, missing));
    const previous = snapshot(root);
    assert.throws(() => preparePublicSite(root), /unexpected files|missing required files/);
    assert.deepEqual(snapshot(root), previous);
  }
});

test("converter modules and their required license, notice and source bundle are explicit lazy assets", (t) => {
  const root = fixture(t);
  preparePublicSite(root);
  const previous = snapshot(root);
  for (const name of heicFiles) assert.ok(previous[name].length > 0, `${name} must be included`);
  for (const name of PUBLIC_FILES.filter(name => name.endsWith(".html"))) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, name), "utf8"), /(?:src|href)\s*=\s*["'][^"']*(?:heic-input\.js|vendor\/heic-to\/heic-to\.js)/i);
  }
  fs.writeFileSync(path.join(root, "heic-input.js"), 'export async function convert() { return import("./vendor/heic-to/heic-to.js"); }');
  fs.writeFileSync(path.join(root, "vendor", "heic-to", "heic-to.js"), 'export default function decoder() { return "fixture"; }');
  preparePublicSite(root);
  const modules = snapshot(root);
  fs.writeFileSync(path.join(root, "vendor", "heic-to", "heic-to.js"), "export default function (");
  assert.throws(() => preparePublicSite(root), error => error instanceof SyntaxError && error.message.includes("heic-to.js"));
  assert.deepEqual(snapshot(root), modules);
  fs.writeFileSync(path.join(root, "vendor", "heic-to", "heic-to.js"), 'export default function decoder() { return "fixture"; }');
  for (const name of heicFiles.slice(2)) {
    fs.writeFileSync(path.join(root, name), "");
    assert.throws(() => preparePublicSite(root), error => error.message.includes(name) && /empty/.test(error.message));
    assert.deepEqual(snapshot(root), modules);
    fs.writeFileSync(path.join(root, name), previous[name]);
  }
});

test("rebuilding replaces the generated version without retaining stale file contents", (t) => {
  const root = fixture(t);
  preparePublicSite(root);
  fs.appendFileSync(path.join(root, "styles.css"), "\n/* publication update */\n");
  preparePublicSite(root);
  assert.deepEqual(snapshot(root)["styles.css"], fs.readFileSync(path.join(root, "styles.css")));
  assert.deepEqual(Object.keys(snapshot(root)).sort(), expectedFiles(root));
});

test("changing the selected catalogue replaces old generated assets without publishing unlisted source files", (t) => {
  const root = fixture(t);
  const oldPhotos = catalogue(root).photos;
  const destination = preparePublicSite(root);
  const selected = writePhotos(root, [{ name: "%2F new image.JPG", mimeType: "image/jpeg", bytes: Buffer.from([...jpeg, 3]) }]);
  preparePublicSite(root);
  assert.deepEqual(Object.keys(snapshot(root)).sort(), expectedFiles(root));
  for (const photo of oldPhotos) {
    assert.equal(fs.existsSync(path.join(root, photo.path)), true, "the original source is not removed");
    assert.equal(fs.existsSync(path.join(destination, photo.path)), false, "a stale generated asset is removed");
  }
  assert.deepEqual(fs.readFileSync(path.join(destination, selected[0].path)), Buffer.from([...jpeg, 3]));
});

test("all four supported image formats and raw special-character filenames survive packaging", (t) => {
  const root = fixture(t);
  const photos = writePhotos(root, [
    { name: "café #1? 100%.jpg", mimeType: "image/jpeg", bytes: jpeg },
    { name: "%2F.png", mimeType: "image/png", bytes: png },
    { name: "web photo.webp", mimeType: "image/webp", bytes: Buffer.from("RIFF0000WEBPimage") },
    { name: "film.avif", mimeType: "image/avif", bytes: Buffer.from("0000ftypavif0000avif") }
  ]);
  const references = photos.map((photo) => `<img src="${photo.path.split("/").map(encodeURIComponent).join("/")}" alt="">`).join("\n");
  fs.appendFileSync(path.join(root, "experiment-1.html"), references);
  const destination = preparePublicSite(root);
  assert.deepEqual(Object.keys(snapshot(root)).sort(), expectedFiles(root));
  for (const photo of photos) assert.equal(fs.readFileSync(path.join(destination, photo.path)).length, photo.byteLength);
});

test("unsafe paths, unsupported files, duplicate photos and invalid metadata preserve the previous output", (t) => {
  const root = fixture(t);
  preparePublicSite(root);
  const previous = snapshot(root);
  const original = catalogue(root);
  const invalidCatalogues = [
    { ...original, version: 2 },
    { ...original, photos: {} },
    ...["../private.jpg", "nested/photo.jpg", "back\\photo.jpg", "line\nbreak.jpg", ".", "..", "Code.gs", "README.md"].map((name) => ({
      ...original, photos: [{ ...original.photos[0], name, path: `assets/base-photos/${name}` }]
    })),
    ...["/private.jpg", "images/private.jpg", "assets/base-photos/../private.jpg"].map((filename) => ({
      ...original, photos: [{ ...original.photos[0], path: filename }]
    })),
    ...[{ sha256: "invalid" }, { byteLength: 0 }, { byteLength: 1.5 }, { byteLength: 30 * 1024 * 1024 + 1 }, { mimeType: "text/plain" }].map((change) => ({
      ...original, photos: [{ ...original.photos[0], ...change }]
    })),
    { ...original, photos: [original.photos[0], { ...original.photos[0], name: "copy.jpg", path: "assets/base-photos/copy.jpg" }] },
    { ...original, photos: [original.photos[0], { ...original.photos[0], sha256: original.photos[1].sha256 }] }
  ];
  for (const invalid of invalidCatalogues) {
    fs.writeFileSync(path.join(root, catalogueFile), JSON.stringify(invalid));
    assert.throws(() => preparePublicSite(root), /catalogue|duplicate|unsafe|metadata/);
    assert.deepEqual(snapshot(root), previous);
  }
  fs.writeFileSync(path.join(root, catalogueFile), "not JSON");
  assert.throws(() => preparePublicSite(root), /valid JSON/);
  assert.deepEqual(snapshot(root), previous);
});

test("asset size, SHA-256 and image signature mismatches fail before the previous output is replaced", (t) => {
  const root = fixture(t);
  preparePublicSite(root);
  const previous = snapshot(root);
  const original = catalogue(root);
  const photo = original.photos[0];
  const filename = path.join(root, photo.path);
  const originalBytes = fs.readFileSync(filename);
  for (const bytes of [Buffer.from([...jpeg, 5]), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9])]) {
    fs.writeFileSync(filename, bytes);
    assert.throws(() => preparePublicSite(root), /size or SHA-256/);
    assert.deepEqual(snapshot(root), previous);
  }
  fs.writeFileSync(filename, originalBytes);
  fs.writeFileSync(path.join(root, catalogueFile), JSON.stringify({ ...original, photos: [{ ...photo, mimeType: "image/png" }] }));
  assert.throws(() => preparePublicSite(root), /image signature/);
  assert.deepEqual(snapshot(root), previous);
});

test("symlinked catalogue, asset directories and photo files cannot pull private files into a publication", (t) => {
  for (const entry of [catalogueFile, "assets/base-photos", "selected-photo", "assets"]) {
    const root = fixture(t);
    const relative = entry === "selected-photo" ? catalogue(root).photos[0].path : entry;
    preparePublicSite(root);
    const previous = snapshot(root);
    const filename = path.join(root, relative);
    const relocated = path.join(root, "private-source");
    fs.renameSync(filename, relocated);
    fs.symlinkSync(relocated, filename);
    assert.throws(() => preparePublicSite(root), /symlink/);
    assert.deepEqual(snapshot(root), previous);
  }
});

test("a symlinked generated asset directory is rejected without touching its target", (t) => {
  const root = fixture(t);
  const destination = preparePublicSite(root);
  const originalDirectory = path.join(destination, "assets", "base-photos");
  const target = path.join(root, "preserved-assets");
  fs.renameSync(originalDirectory, target);
  fs.symlinkSync(target, originalDirectory);
  const names = fs.readdirSync(target).sort();
  assert.throws(() => preparePublicSite(root), /not a regular generated file/);
  assert.equal(fs.lstatSync(originalDirectory).isSymbolicLink(), true);
  assert.deepEqual(fs.readdirSync(target).sort(), names);
});

test("unlisted files and directories inside generated asset output are never silently removed", (t) => {
  const root = fixture(t);
  const destination = preparePublicSite(root);
  const unlisted = path.join(destination, "assets", "base-photos", "unlisted.jpg");
  fs.writeFileSync(unlisted, jpeg);
  assert.throws(() => preparePublicSite(root), /unexpected files/);
  assert.deepEqual(fs.readFileSync(unlisted), jpeg);
  fs.unlinkSync(unlisted);
  const extraDirectory = path.join(destination, "assets", "private-experiment");
  fs.mkdirSync(extraDirectory);
  assert.throws(() => preparePublicSite(root), /unexpected files/);
  assert.equal(fs.existsSync(extraDirectory), true);
});

test("a modified generated photograph is preserved rather than mistaken for disposable output", (t) => {
  const root = fixture(t);
  const destination = preparePublicSite(root);
  const filename = path.join(destination, catalogue(root).photos[0].path);
  fs.writeFileSync(filename, "a manually changed file");
  const previous = snapshot(root);
  assert.throws(() => preparePublicSite(root), /size or SHA-256/);
  assert.deepEqual(snapshot(root), previous);
});

test("a missing or symlinked source leaves the previous publication intact", (t) => {
  for (const kind of ["stylesheet", "photograph"]) {
    const root = fixture(t);
    const name = kind === "stylesheet" ? "styles.css" : catalogue(root).photos[0].path;
    preparePublicSite(root);
    const previous = snapshot(root);
    fs.unlinkSync(path.join(root, name));
    assert.throws(() => preparePublicSite(root), /ENOENT/);
    assert.deepEqual(snapshot(root), previous);
    fs.writeFileSync(path.join(root, "private-source"), "private");
    fs.symlinkSync(path.join(root, "private-source"), path.join(root, name));
    assert.throws(() => preparePublicSite(root), /not a symlink/);
    assert.deepEqual(snapshot(root), previous);
  }
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

test("a partial experiment-page output is not mistaken for a known prior release", (t) => {
  const root = fixture(t);
  const destination = preparePublicSite(root);
  fs.unlinkSync(path.join(destination, "experiment-2.html"));
  const previous = snapshot(root);
  assert.throws(() => preparePublicSite(root), /unexpected files/);
  assert.deepEqual(snapshot(root), previous);
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
  for (const page of ["index.html", "double-exposure.html", "experiment-1.html", "experiment-2.html", "experiment-3.html"]) {
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
