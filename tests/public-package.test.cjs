"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { PUBLIC_FILES, OUTPUT_DIRECTORY, preparePublicSite } = require("../scripts/prepare-public-site.cjs");

const project = path.resolve(__dirname, "..");
const catalogueFile = "assets/base-photos.json";
const galleryCatalogueFile = "assets/gallery-photos.json";
const galleryFiles = ["experiment-carousel.css", "experiment-carousel.js"];
const memoryPartFiles = ["experiment-2-part-1.html", "experiment-2-part-2.html"];
const headerTemplate = "includes/site-header.html";
const headerScript = "site-header.js";
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

function galleryPhotos(root) {
  const files = new Set();
  for (const page of PUBLIC_FILES.filter(name => name.endsWith(".html"))) {
    const html = fs.readFileSync(path.join(root, page), "utf8").replace(/<!--[\s\S]*?-->/g, "");
    for (const [, reference] of html.matchAll(/\b(?:src|href)="(images\/[^"?#]+)"/g)) {
      files.add(decodeURIComponent(reference));
    }
  }
  return [...files].sort();
}

function expectedFiles(root) {
  return [...PUBLIC_FILES, galleryCatalogueFile, ...galleryPhotos(root), ...catalogue(root).photos.map((photo) => photo.path)].sort();
}

function restoreSingleMemoryPage(destination) {
  fs.renameSync(path.join(destination, memoryPartFiles[0]), path.join(destination, "experiment-2.html"));
  fs.unlinkSync(path.join(destination, memoryPartFiles[1]));
  const filename = path.join(destination, galleryCatalogueFile);
  if (fs.existsSync(filename)) {
    const manifest = JSON.parse(fs.readFileSync(filename));
    manifest.pages = [...manifest.pages.filter(name => !memoryPartFiles.includes(name)), "experiment-2.html"];
    fs.writeFileSync(filename, JSON.stringify(manifest));
  }
}

function removeGalleryOutput(destination) {
  for (const name of [...galleryFiles, galleryCatalogueFile, headerScript, "images"]) {
    fs.rmSync(path.join(destination, name), { recursive: true, force: true });
  }
  restoreSingleMemoryPage(destination);
}

function oldExpectedFiles(root) {
  return [...expectedFiles(root).filter(name => !galleryFiles.includes(name) && !memoryPartFiles.includes(name)
    && name !== galleryCatalogueFile && name !== headerScript && !name.startsWith("images/")), "experiment-2.html"].sort();
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "exposure-public-package-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const name of PUBLIC_FILES) {
    if (name === catalogueFile) continue;
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.copyFileSync(path.join(project, name), path.join(root, name));
  }
  fs.mkdirSync(path.join(root, "includes"));
  fs.copyFileSync(path.join(project, headerTemplate), path.join(root, headerTemplate));
  // Keep the current page's real paths, but use small synthetic photo bytes.
  for (const name of PUBLIC_FILES.filter(name => name.endsWith(".html"))) {
    const html = fs.readFileSync(path.join(root, name), "utf8").replace(/<!--[\s\S]*?-->/g, "");
    for (const [, reference] of html.matchAll(/\bsrc="(images\/[^"?#]+)"/g)) {
      const filename = path.join(root, decodeURIComponent(reference));
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, path.extname(filename).toLowerCase() === ".png" ? png : jpeg);
    }
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

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assetReferences(files, page) {
  const html = files[page].toString("utf8").replace(/<!--[\s\S]*?-->/g, "");
  return [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)]
    .map(([, reference]) => new URL(reference.replace(/&amp;/g, "&"), `https://site.example/${page}`))
    .filter(url => /\.(?:css|js)$/.test(url.pathname));
}

function assetReference(files, page, name) {
  const reference = assetReferences(files, page).find(url => url.pathname === `/${name}`);
  assert.ok(reference, `${page} must reference ${name}`);
  return reference;
}

function assertContentLabels(files) {
  for (const page of PUBLIC_FILES.filter(name => name.endsWith(".html"))) {
    for (const url of assetReferences(files, page)) {
      assert.deepEqual(url.searchParams.getAll("v"), [sha256(files[url.pathname.slice(1)])],
        `${page}: ${url.pathname} must identify its emitted contents`);
    }
  }
  for (const [parent, target] of [["scripts.js", "heic-input.js"], ["heic-input.js", "vendor/heic-to/heic-to.js"]]) {
    const imports = [...files[parent].toString("utf8").matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)]
      .map(([, reference]) => new URL(reference, `https://site.example/${parent}`));
    const imported = imports.find(url => url.pathname === `/${target}`);
    assert.ok(imported, `${parent} must still load ${target} lazily`);
    assert.deepEqual(imported.searchParams.getAll("v"), [sha256(files[target])], `${parent}: stale lazy import`);
  }
}

function withoutGeneratedHeader(bytes) {
  return bytes.toString("utf8").replace(/\?v=[a-z0-9-]+/gi, "")
    .replace(/<div\b([^>]*\bdata-site-header(?=[\s=>])[^>]*)>[\s\S]*?<\/div>/gi,
      (_, attributes) => `<div${attributes.replace(/\sdata-site-header-rendered\b/g, "")}></div>`)
    .replace(/<title\b([^>]*\bdata-site-name\b[^>]*)>[\s\S]*?<\/title>/gi, "<title$1></title>")
    .replace(/<meta\b([^>]*\bdata-site-name\b[^>]*)>/gi,
      (_, attributes) => `<meta${attributes.replace(/\bcontent\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, 'content=""')}>`);
}

test("publication contains site code, selected artist photos and referenced gallery images while excluding private support files", (t) => {
  assert.deepEqual([...PUBLIC_FILES].sort(), [
    "styles.css", "scripts.js", "project-config.js", headerScript,
    "archive-workflow.js", "drive-storage.js", "drive-bridge.js", "artist-import.js", "artist-import.css",
    ...fs.readdirSync(project).filter(name => !name.startsWith(".") && /\.html$/i.test(name) && name !== "local-test.html"),
    "base-assets.js", catalogueFile,
    "heic-input.js", "vendor/heic-to/heic-to.js", "vendor/heic-to/LICENSE",
    "vendor/heic-to/NOTICE.txt", "vendor/heic-to/SOURCES.tar.gz", ".nojekyll", ...galleryFiles
  ].sort());
  const root = fixture(t);
  for (const name of ["private-photo.jpg", "local-test.html", ".env", "README.md", "AGENTS.md", "Code.gs", "Storage.gs"]) fs.writeFileSync(path.join(root, name), "private");
  fs.mkdirSync(path.join(root, "google-apps-script"));
  fs.writeFileSync(path.join(root, "google-apps-script", "Code.gs"), "private backend");
  fs.writeFileSync(path.join(root, "google-apps-script", "Artist.html"), "private backend page");
  fs.mkdirSync(path.join(root, "scripts", "vendor", "es-module-lexer"), { recursive: true });
  fs.writeFileSync(path.join(root, "scripts", "vendor", "es-module-lexer", "lexer.cjs"), "private preparation tool");
  fs.mkdirSync(path.join(root, ".git"));
  fs.writeFileSync(path.join(root, ".git", "config"), "private history");
  fs.mkdirSync(path.join(root, "images", "experiment-1"), { recursive: true });
  fs.writeFileSync(path.join(root, "images", "experiment-1", "additional-gallery.jpg"), jpeg);
  fs.writeFileSync(path.join(root, "assets", "base-photos", "unlisted-duplicate.jpg"), jpeg);
  fs.writeFileSync(path.join(root, "assets", "base-photos", "README.md"), "private authoring notes");
  fs.writeFileSync(path.join(root, "vendor", "heic-to", "unlisted-notes.txt"), "not selected for publication");
  const destination = preparePublicSite(root);
  assert.equal(destination, path.join(root, OUTPUT_DIRECTORY));
  assert.deepEqual(Object.keys(snapshot(root)).sort(), expectedFiles(root));
  for (const name of expectedFiles(root)) {
    const actual = fs.readFileSync(path.join(destination, name));
    if (name === galleryCatalogueFile) continue;
    const source = fs.readFileSync(path.join(root, name));
    if (name.endsWith(".html") || name === "scripts.js" || name === "heic-input.js") {
      assert.equal(withoutGeneratedHeader(actual), withoutGeneratedHeader(source), `${name}: only shared headers, metadata, and cache labels may change`);
    } else assert.deepEqual(actual, source, `${name}: contents must be copied unchanged`);
  }
  assert.equal(fs.existsSync(path.join(destination, "images", "experiment-1", "additional-gallery.jpg")), false);
  assertContentLabels(snapshot(root));
  assert.deepEqual(fs.readdirSync(root).filter((name) => name.startsWith(".public-site-stage-")), []);
});

test("content labels are deterministic and preparation never edits the source files", (t) => {
  const root = fixture(t);
  const originals = Object.fromEntries([...PUBLIC_FILES, headerTemplate].map(name => [name, fs.readFileSync(path.join(root, name))]));
  preparePublicSite(root);
  const first = snapshot(root);
  assertContentLabels(first);
  preparePublicSite(root);
  assert.deepEqual(snapshot(root), first, "an unchanged rebuild must keep every URL and byte stable");
  for (const [name, bytes] of Object.entries(originals)) {
    assert.deepEqual(fs.readFileSync(path.join(root, name)), bytes, `${name}: source must remain editable and unchanged`);
  }
});

test("editing the one shared header updates static page headers, current navigation, and marked metadata", (t) => {
  const root = fixture(t);
  const filename = path.join(root, headerTemplate);
  const original = fs.readFileSync(filename, "utf8");
  const name = 'Memory &amp; "Light" $&';
  fs.writeFileSync(filename, original
    .replace(/(\bdata-site-name[^>]*>)[^<]*(<\/a>)/, (_, before, after) => `${before}${name}${after}`)
    .replace('class="site-divider"', 'class="site-divider" data-divider-note="changed"'));
  const destination = preparePublicSite(root);
  const files = snapshot(root);
  assert.equal(fs.existsSync(path.join(destination, headerTemplate)), false, "the editable template stays out of the static publication");
  for (const page of PUBLIC_FILES.filter(name => name.endsWith(".html"))) {
    const source = fs.readFileSync(path.join(root, page), "utf8");
    const html = files[page].toString("utf8");
    assert.match(html, /data-site-header-rendered/, `${page}: header must exist before JavaScript runs`);
    assert.ok(html.includes(`data-site-name>${name}</a>`), `${page}: shared brand name`);
    assert.match(html, /class="site-divider" data-divider-note="changed"/, `${page}: shared divider markup`);
    const main = source.match(/<main\b[\s\S]*?<\/main>/)?.[0];
    if (main) assert.ok(html.includes(main), `${page}: page content must remain unchanged`);
    const navigation = html.match(/<nav\b[^>]*\bdata-experiment-navigation\b[^>]*>[\s\S]*?<\/nav>/)?.[0];
    if (source.includes('data-site-header="experiments"')) {
      assert.ok(navigation, `${page}: experiment links`);
      const current = [...navigation.matchAll(/<a\b[^>]*\baria-current="page"[^>]*>/g)];
      assert.equal(current.length, 1, `${page}: exactly one current-page link`);
      assert.ok(current[0][0].includes(`href="${page}"`));
    } else assert.equal(navigation, undefined, `${page}: keep the home/tool navigation behavior`);
    if (source.includes("<title data-site-name>")) assert.ok(html.includes(`<title data-site-name>${name}</title>`));
    if (source.includes('property="og:title"')) {
      assert.ok(html.includes('property="og:title" content="Memory &amp; &quot;Light&quot; $&" data-site-name'));
      assert.ok(html.includes('property="og:site_name" content="Memory &amp; &quot;Light&quot; $&" data-site-name'));
    }
    const heading = source.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/)?.[0];
    if (heading) assert.ok(html.includes(heading), `${page}: page heading stays intact`);
  }
  assertContentLabels(files);
});

test("literal markup in the shared title remains escaped text in headers and metadata", (t) => {
  const root = fixture(t);
  const name = "Ghost Image &lt;br&gt; Apparitions";
  const filename = path.join(root, headerTemplate);
  const template = fs.readFileSync(filename, "utf8");
  fs.writeFileSync(filename, template.replace(/(\bdata-site-name[^>]*>)[^<]*(<\/a>)/,
    (_, before, after) => `${before}${name}${after}`));
  preparePublicSite(root);
  const files = snapshot(root);
  for (const page of PUBLIC_FILES.filter(name => name.endsWith(".html"))) {
    const source = fs.readFileSync(path.join(root, page), "utf8");
    const html = files[page].toString("utf8");
    const header = html.match(/<div\b[^>]*\bdata-site-header-rendered\b[^>]*>[\s\S]*?<\/div>/)?.[0];
    assert.ok(header?.includes(`data-site-name>${name}</a>`), `${page}: visible literal tag`);
    assert.doesNotMatch(header, /<br\b/i, `${page}: the title must not create a line-break element`);
    assert.doesNotMatch(header, /&amp;(?:lt|gt);/, `${page}: title references must not be double escaped`);
    if (source.includes("<title data-site-name>")) {
      assert.ok(html.includes(`<title data-site-name>${name}</title>`), `${page}: literal browser title`);
    }
    if (source.includes('property="og:title"')) {
      assert.ok(html.includes(`property="og:title" content="${name}" data-site-name`));
      assert.ok(html.includes(`property="og:site_name" content="${name}" data-site-name`));
    }
  }
});

test("unsafe shared header changes fail before replacing the prior publication", (t) => {
  const root = fixture(t);
  preparePublicSite(root);
  const previous = snapshot(root);
  const filename = path.join(root, headerTemplate);
  const source = fs.readFileSync(filename, "utf8");
  for (const addition of ['<script>alert(1)</script>', '<p style="color:red">text</p>', '<a href="README.md">private notes</a>']) {
    fs.writeFileSync(filename, source + addition);
    assert.throws(() => preparePublicSite(root), /external files|unpublished file/);
    assert.deepEqual(snapshot(root), previous);
  }
  fs.writeFileSync(filename, source.replace(/\bdata-site-name\b/, "data-other-name"));
  assert.throws(() => preparePublicSite(root), /shared header.*site name/);
  assert.deepEqual(snapshot(root), previous);
});

test("nonempty shared header slots cannot leave a prepared page dependent on its private template", (t) => {
  const root = fixture(t);
  preparePublicSite(root);
  const previous = snapshot(root);
  const filename = path.join(root, memoryPartFiles[0]);
  const source = fs.readFileSync(filename, "utf8");
  fs.writeFileSync(filename, source.replace('<div data-site-header="experiments"></div>', '<div data-site-header="experiments">stale header</div>'));
  assert.throws(() => preparePublicSite(root), /shared-header slot must be empty/);
  assert.deepEqual(snapshot(root), previous);
});

test("a complete earlier gallery without shared headers upgrades while missing current header scripts are rejected", (t) => {
  const root = fixture(t);
  const destination = preparePublicSite(root);
  fs.unlinkSync(path.join(destination, headerScript));
  const incomplete = snapshot(root);
  assert.throws(() => preparePublicSite(root), /missing required files|unexpected files/);
  assert.deepEqual(snapshot(root), incomplete);
  for (const page of PUBLIC_FILES.filter(name => name.endsWith(".html"))) {
    const filename = path.join(destination, page);
    const html = fs.readFileSync(filename, "utf8")
      .replace(/\sdata-site-header-rendered\b/g, "")
      .replace(/<script\b[^>]*\bsrc="site-header\.js[^"\s]*"[^>]*><\/script>\s*/g, "");
    fs.writeFileSync(filename, html);
  }
  preparePublicSite(root);
  assert.deepEqual(Object.keys(snapshot(root)).sort(), expectedFiles(root));
});

test("the empty static-site marker preserves underscore photo names without publishing other dotfiles", (t) => {
  const root = fixture(t);
  const [photo] = writePhotos(root, [{ name: "_DSC2813.JPG", mimeType: "image/jpeg", bytes: jpeg }]);
  fs.writeFileSync(path.join(root, ".private-notes"), "private");
  const destination = preparePublicSite(root);
  assert.equal(fs.statSync(path.join(destination, ".nojekyll")).size, 0);
  assert.deepEqual(fs.readFileSync(path.join(destination, photo.path)), jpeg);
  assert.deepEqual(Object.keys(snapshot(root)).sort(), expectedFiles(root));
  const previous = snapshot(root);
  fs.writeFileSync(path.join(root, "styles.css"), "");
  assert.throws(() => preparePublicSite(root), /styles\.css is empty/);
  assert.deepEqual(snapshot(root), previous, "the empty-marker exception must not admit empty code or replace a valid output");
});

test("the preceding twenty-file release gains the static-site marker without changing selected photos", (t) => {
  const root = fixture(t);
  const destination = preparePublicSite(root);
  removeGalleryOutput(destination);
  fs.unlinkSync(path.join(destination, ".nojekyll"));
  const previous = snapshot(root);
  assert.deepEqual(Object.keys(previous).sort(), oldExpectedFiles(root).filter(name => name !== ".nojekyll"));
  preparePublicSite(root);
  const updated = snapshot(root);
  assert.deepEqual(updated[".nojekyll"], Buffer.alloc(0));
  assert.deepEqual(Object.keys(updated).sort(), expectedFiles(root));
  for (const photo of catalogue(root).photos) assert.deepEqual(updated[photo.path], previous[photo.path]);
});

test("a complete previous marked release upgrades to gallery publishing", (t) => {
  const root = fixture(t);
  const destination = preparePublicSite(root);
  removeGalleryOutput(destination);
  assert.deepEqual(Object.keys(snapshot(root)).sort(), oldExpectedFiles(root));
  preparePublicSite(root);
  assert.deepEqual(Object.keys(snapshot(root)).sort(), expectedFiles(root));
});

test("a complete single-page Memory gallery upgrades to two parts without changing photos", (t) => {
  const root = fixture(t);
  const destination = preparePublicSite(root);
  restoreSingleMemoryPage(destination);
  const previous = snapshot(root);
  preparePublicSite(root);
  const updated = snapshot(root);
  assert.deepEqual(Object.keys(updated).sort(), expectedFiles(root));
  assert.equal(fs.existsSync(path.join(destination, "experiment-2.html")), false);
  for (const name of [...galleryPhotos(root), ...catalogue(root).photos.map(photo => photo.path)]) {
    assert.deepEqual(updated[name], previous[name]);
  }
});

test("new root pages and renamed pages are discovered without changing the publication list", (t) => {
  const root = fixture(t);
  const destination = preparePublicSite(root);
  const oldPage = "another-experiment.html";
  const nextPage = "renamed-experiment.html";
  const home = path.join(root, "index.html");
  fs.writeFileSync(path.join(root, oldPage), '<!doctype html><title>Another experiment</title><a href="index.html">Home</a>');
  const originalHome = fs.readFileSync(home, "utf8");
  fs.writeFileSync(home, originalHome + `<a href="${oldPage}">Another experiment</a>`);
  preparePublicSite(root);
  assert.equal(fs.existsSync(path.join(destination, oldPage)), true);
  fs.renameSync(path.join(root, oldPage), path.join(root, nextPage));
  fs.writeFileSync(home, originalHome + `<a href="${nextPage}">Another experiment</a>`);
  preparePublicSite(root);
  assert.equal(fs.existsSync(path.join(destination, oldPage)), false);
  assert.equal(fs.existsSync(path.join(destination, nextPage)), true);
  assert.equal(fs.existsSync(path.join(destination, "local-test.html")), false);
});

test("gallery changes preserve exact bytes and replace only validated previous gallery output", (t) => {
  const root = fixture(t);
  const filename = "images/experiment-2/space # and % image.JPG";
  fs.mkdirSync(path.dirname(path.join(root, filename)), { recursive: true });
  fs.writeFileSync(path.join(root, filename), jpeg);
  const page = path.join(root, "experiment-2-part-1.html");
  const originalHtml = fs.readFileSync(page, "utf8");
  fs.appendFileSync(page, `<img src="${filename.split("/").map(encodeURIComponent).join("/")}" alt="">`);
  fs.writeFileSync(path.join(root, "images", ".DS_Store"), "metadata");
  fs.writeFileSync(path.join(root, "images", "notes.txt"), "not a photograph");
  const destination = preparePublicSite(root);
  const manifest = JSON.parse(fs.readFileSync(path.join(destination, galleryCatalogueFile), "utf8"));
  const entry = manifest.photos.find(photo => photo.path === filename);
  assert.equal(entry.sha256, sha256(jpeg));
  assert.deepEqual(fs.readFileSync(path.join(destination, filename)), jpeg);
  assert.equal(fs.existsSync(path.join(destination, "images", ".DS_Store")), false);
  assert.equal(fs.existsSync(path.join(destination, "images", "notes.txt")), false);
  fs.writeFileSync(page, originalHtml);
  fs.unlinkSync(path.join(root, filename));
  preparePublicSite(root);
  assert.equal(fs.existsSync(path.join(destination, filename)), false);
  const first = galleryPhotos(root)[0];
  fs.writeFileSync(path.join(destination, first), "manually edited gallery output");
  const previous = snapshot(root);
  assert.throws(() => preparePublicSite(root), /size or SHA-256/);
  assert.deepEqual(snapshot(root), previous);
});

test("gallery symlinks, unlisted output files and missing manifests preserve the old site", (t) => {
  for (const kind of ["source-directory", "source-file", "output-extra", "output-manifest", "manifest-path"]) {
    const root = fixture(t);
    const destination = preparePublicSite(root);
    if (kind === "source-directory" || kind === "source-file") {
      const relative = kind === "source-directory" ? "images" : galleryPhotos(root)[0];
      const filename = path.join(root, relative);
      const target = path.join(root, "private-source");
      fs.renameSync(filename, target);
      fs.symlinkSync(target, filename);
    } else if (kind === "output-extra") fs.writeFileSync(path.join(destination, "images", "extra.jpg"), jpeg);
    else if (kind === "output-manifest") fs.unlinkSync(path.join(destination, galleryCatalogueFile));
    else {
      const filename = path.join(destination, galleryCatalogueFile);
      const manifest = JSON.parse(fs.readFileSync(filename));
      manifest.photos[0].path = "images/../private.jpg";
      fs.writeFileSync(filename, JSON.stringify(manifest));
    }
    const previous = snapshot(root);
    assert.throws(() => preparePublicSite(root), /symlink|unexpected|catalogue|unsafe/);
    assert.deepEqual(snapshot(root), previous);
  }
});

test("a marked output with missing HEIC files is not mistaken for the older fifteen-file release", (t) => {
  const root = fixture(t);
  const destination = preparePublicSite(root);
  fs.unlinkSync(path.join(destination, "heic-input.js"));
  fs.rmSync(path.join(destination, "vendor"), { recursive: true });
  const previous = snapshot(root);
  assert.throws(() => preparePublicSite(root), /unexpected files|missing required files/);
  assert.deepEqual(snapshot(root), previous);
});

for (const previousCount of [7, 9, 10, 13]) {
  test(`the preceding ${previousCount}-file release upgrades to the manifest-listed publication`, (t) => {
    const root = fixture(t);
    const destination = preparePublicSite(root);
    removeGalleryOutput(destination);
    const removed = [
      ".nojekyll", "heic-input.js", "vendor", "base-assets.js", "assets",
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
  removeGalleryOutput(destination);
  fs.unlinkSync(path.join(destination, "heic-input.js"));
  fs.rmSync(path.join(destination, "vendor"), { recursive: true });
  fs.unlinkSync(path.join(destination, ".nojekyll"));
  const previous = snapshot(root);
  assert.deepEqual(Object.keys(previous).sort(), oldExpectedFiles(root).filter(name => name !== ".nojekyll" && !heicFiles.includes(name)));
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
  const previous = snapshot(root);
  fs.appendFileSync(path.join(root, "styles.css"), "\n/* publication update */\n");
  preparePublicSite(root);
  const updated = snapshot(root);
  assert.deepEqual(updated["styles.css"], fs.readFileSync(path.join(root, "styles.css")));
  assert.deepEqual(Object.keys(updated).sort(), expectedFiles(root));
  assertContentLabels(updated);
  for (const page of PUBLIC_FILES.filter(name => name.endsWith(".html"))) {
    assert.notEqual(assetReference(updated, page, "styles.css").searchParams.get("v"),
      assetReference(previous, page, "styles.css").searchParams.get("v"), `${page}: changed CSS must get a fresh URL`);
  }
  for (const name of PUBLIC_FILES.filter(name => name.endsWith(".js"))) {
    assert.deepEqual(updated[name], previous[name], `${name}: a CSS-only update must leave scripts unchanged`);
  }
});

test("a JavaScript-only update refreshes its URL without changing the stylesheet label", (t) => {
  const root = fixture(t);
  preparePublicSite(root);
  const previous = snapshot(root);
  fs.appendFileSync(path.join(root, "project-config.js"), "\n/* configuration revision */\n");
  preparePublicSite(root);
  const updated = snapshot(root);
  assertContentLabels(updated);
  const page = "double-exposure.html";
  assert.notEqual(assetReference(updated, page, "project-config.js").href,
    assetReference(previous, page, "project-config.js").href);
  assert.equal(assetReference(updated, page, "styles.css").href, assetReference(previous, page, "styles.css").href);
});

for (const dependency of ["heic-input.js", "vendor/heic-to/heic-to.js"]) {
  test(`a changed ${dependency} refreshes its lazy parents using their final emitted bytes`, (t) => {
    const root = fixture(t);
    preparePublicSite(root);
    const previous = snapshot(root);
    fs.appendFileSync(path.join(root, dependency), "\n/* dependency revision */\n");
    preparePublicSite(root);
    const updated = snapshot(root);
    assertContentLabels(updated);
    assert.notDeepEqual(updated["heic-input.js"], previous["heic-input.js"]);
    assert.notDeepEqual(updated["scripts.js"], previous["scripts.js"]);
    assert.notEqual(assetReference(updated, "double-exposure.html", "scripts.js").href,
      assetReference(previous, "double-exposure.html", "scripts.js").href);
    assert.deepEqual(updated["styles.css"], previous["styles.css"]);
    assert.deepEqual(updated["project-config.js"], previous["project-config.js"]);
    assert.deepEqual(updated["vendor/heic-to/heic-to.js"], fs.readFileSync(path.join(root, "vendor/heic-to/heic-to.js")),
      "the separate decoder must retain its exact source bytes");
  });
}

test("automatic labels replace forgotten or repeated versions and preserve query options, fragments and comments", (t) => {
  const root = fixture(t);
  const page = path.join(root, "index.html");
  const comment = '<!-- <link rel="stylesheet" href="styles.css?v=comment-only"> -->';
  const originalHtml = fs.readFileSync(page, "utf8");
  const customHtml = originalHtml.replace(/styles\.css(?:\?[^"']*)?/, "styles.css?theme=dark&amp;v=1&amp;v=1#palette") + comment;
  fs.writeFileSync(page, customHtml);
  const helper = path.join(root, "heic-input.js");
  const originalHelper = fs.readFileSync(helper, "utf8");
  const customHelper = originalHelper.replace('./vendor/heic-to/heic-to.js', './vendor/heic-to/heic-to.js?mode=fast&v=1&v=1#module');
  assert.notEqual(customHelper, originalHelper);
  fs.writeFileSync(helper, customHelper);
  preparePublicSite(root);
  const files = snapshot(root);
  assertContentLabels(files);
  const style = assetReference(files, "index.html", "styles.css");
  assert.equal(style.searchParams.get("theme"), "dark");
  assert.equal(style.hash, "#palette");
  assert.ok(files["index.html"].toString("utf8").includes(comment), "commented examples must not be rewritten");
  const imported = files["heic-input.js"].toString("utf8").match(/import\s*\(\s*["']([^"']+)["']\s*\)/);
  const decoder = new URL(imported[1], "https://site.example/heic-input.js");
  assert.equal(decoder.searchParams.get("mode"), "fast");
  assert.equal(decoder.hash, "#module");
  assert.equal(fs.readFileSync(page, "utf8"), customHtml);
  assert.equal(fs.readFileSync(helper, "utf8"), customHelper);
});

test("a missing local lazy dependency fails before replacing the prior prepared site", (t) => {
  const root = fixture(t);
  preparePublicSite(root);
  const previous = snapshot(root);
  const script = path.join(root, "scripts.js");
  const original = fs.readFileSync(script, "utf8");
  const invalid = original.replace('./heic-input.js', './unselected-private-module.js');
  assert.notEqual(invalid, original);
  fs.writeFileSync(script, invalid);
  assert.throws(() => preparePublicSite(root), /import|dependency|unpublished|unselected|not included/i);
  assert.deepEqual(snapshot(root), previous);
});

test("import examples stay unchanged while a real import inside a template expression is versioned", (t) => {
  const root = fixture(t);
  const script = path.join(root, "scripts.js");
  const examples = '\n// import("./private-line-comment.js")\n'
    + '/* import("./private-block-comment.js") */\n'
    + 'const quotedExample = \'import("./private-string.js")\';\n'
    + 'const templateExample = `import("./private-template.js")`;\n'
    + 'const regexExample = /import\\("\\.\\/private-regex\\.js"\\)/;\n';
  const expression = 'const templateDependency = `${import("./heic-input.js")}`;\n';
  fs.appendFileSync(script, examples + expression);
  preparePublicSite(root);
  const files = snapshot(root);
  assertContentLabels(files);
  const emitted = files["scripts.js"].toString("utf8");
  assert.ok(emitted.includes(examples), "comments, strings, template text and regular expressions must not become dependencies");
  assert.ok(emitted.includes(expression.replace("./heic-input.js", `./heic-input.js?v=${sha256(files["heic-input.js"])}`)),
    "a real import within a template expression must use the emitted dependency hash");
});

test("import.meta stays unchanged while real module dependencies receive content labels", (t) => {
  const root = fixture(t);
  const metadata = "\nconst moduleAddress = import.meta.url;\n";
  fs.appendFileSync(path.join(root, "heic-input.js"), metadata);
  preparePublicSite(root);
  const files = snapshot(root);
  assertContentLabels(files);
  assert.ok(files["heic-input.js"].toString("utf8").endsWith(metadata), "import.meta is metadata, not an asset reference");
});

test("static imports and re-exports preserve escaped URL fragments and valid generated module syntax", (t) => {
  const root = fixture(t);
  const helper = path.join(root, "heic-input.js");
  const statements = String.raw`
import { heicTo as fixtureDecoder } from './vendor/heic-to/heic-to.js#quote\'fragment';
export { heicTo as fixtureExport } from './vendor/heic-to/heic-to.js#reexport\'fragment';
`;
  fs.appendFileSync(helper, statements);
  const source = fs.readFileSync(helper, "utf8");
  preparePublicSite(root);
  const files = snapshot(root);
  assertContentLabels(files);
  const emitted = files["heic-input.js"].toString("utf8");
  for (const fragment of ["#quote'fragment", "#reexport'fragment"]) {
    const reference = `./vendor/heic-to/heic-to.js?v=${sha256(files["vendor/heic-to/heic-to.js"])}${fragment}`;
    assert.ok(emitted.includes(`from ${JSON.stringify(reference)};`), "decoded fragments must survive safely quoted URL replacement");
  }
  const syntax = spawnSync(process.execPath, ["--input-type=module", "--check"], {
    input: emitted, encoding: "utf8", timeout: 5000
  });
  assert.equal(syntax.status, 0, syntax.error?.message || syntax.stderr);
  assert.equal(fs.readFileSync(helper, "utf8"), source, "source module quoting must stay unchanged");
});

test("a circular local import fails before replacing the prior prepared site", (t) => {
  const root = fixture(t);
  preparePublicSite(root);
  const previous = snapshot(root);
  fs.appendFileSync(path.join(root, "heic-input.js"), '\nfunction circularFixture() { return import("./scripts.js"); }\n');
  assert.throws(() => preparePublicSite(root), /circular|cycle/i);
  assert.deepEqual(snapshot(root), previous);
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
  fs.unlinkSync(path.join(destination, "experiment-2-part-2.html"));
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
  for (const page of PUBLIC_FILES.filter(name => name.endsWith(".html"))) {
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
