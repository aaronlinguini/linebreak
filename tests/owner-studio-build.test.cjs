"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { PUBLIC_FILES, addContentVersions } = require("../scripts/prepare-public-site.cjs");
const { ASSET_ROOT, PRIVATE_NOTE, ownerStudioSource, buildOwnerStudio } = require("../scripts/build-owner-studio.cjs");

const project = path.resolve(__dirname, "..");
const assetNames = PUBLIC_FILES.filter(name => /\.(?:css|js)$/.test(name));
const destinationName = "google-apps-script/Studio.html";
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "exposure-owner-studio-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const name of assetNames) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), name.endsWith(".css") ? `/* ${name} */\n` : `// ${name}\n`);
  }
  fs.writeFileSync(path.join(root, "scripts.js"), 'function prepareFixture() { return import("./heic-input.js"); }\n');
  fs.writeFileSync(path.join(root, "heic-input.js"), 'export function decodeFixture() { return import("./vendor/heic-to/heic-to.js"); }\n');
  fs.writeFileSync(path.join(root, "vendor/heic-to/heic-to.js"), 'export const fixtureDecoder = "original";\n');
  fs.copyFileSync(path.join(project, "local-test.html"), path.join(root, "local-test.html"));
  fs.mkdirSync(path.join(root, "google-apps-script"));
  return root;
}

function assetContents(root) {
  return new Map(assetNames.map(name => [name, fs.readFileSync(path.join(root, name))]));
}

function assetReferences(html) {
  return [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)]
    .map(([, reference]) => reference.replace(/&amp;/g, "&"))
    .filter(reference => /\.(?:css|js)(?:[?#]|$)/.test(reference));
}

function assertAssetHashes(html, emitted) {
  for (const reference of assetReferences(html)) {
    assert.ok(reference.startsWith(ASSET_ROOT), `${reference}: private templates need the configured HTTPS asset root`);
    const url = new URL(reference.slice(ASSET_ROOT.length), "https://site.example/");
    const filename = decodeURIComponent(url.pathname.slice(1));
    assert.ok(emitted.has(filename), `${filename}: assets must be publicly selected`);
    assert.deepEqual(url.searchParams.getAll("v"), [sha256(emitted.get(filename))], `${filename}: hash must match final emitted bytes`);
  }
}

test("the private template reuses canonical markup, separate assets and final emitted content labels", t => {
  const root = fixture(t);
  const original = fs.readFileSync(path.join(root, "local-test.html"));
  const contents = assetContents(root);
  const emitted = addContentVersions(contents);
  const destination = buildOwnerStudio({ root });
  const html = fs.readFileSync(destination, "utf8");
  assert.equal(destination, path.join(root, destinationName));
  assert.match(html, /<body\b[^>]*\bdata-owner-studio="true"/);
  assert.equal((html.match(/\bdata-owner-studio=/g) || []).length, 1);
  assert.ok(html.includes(PRIVATE_NOTE));
  assert.doesNotMatch(html, /Nothing is uploaded or automatically saved/);
  assert.ok(html.indexOf("owner-studio.js?") > html.indexOf("local-test.js?"));
  assert.equal((html.match(/<script\b[^>]*\bsrc=["'][^"']*owner-studio\.js/gi) || []).length, 1);
  assert.doesNotMatch(html, /<style\b|\sstyle\s*=|\son[a-z]+\s*=/i);
  for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    assert.match(attributes, /\bsrc=/);
    assert.equal(body.trim(), "");
  }
  assertAssetHashes(html, emitted);
  const scriptReference = assetReferences(html).find(reference => reference.includes("scripts.js?"));
  assert.ok(scriptReference.includes(sha256(emitted.get("scripts.js"))));
  assert.notEqual(sha256(emitted.get("scripts.js")), sha256(contents.get("scripts.js")), "the lazy HEIC import changes scripts.js before its template URL is hashed");
  assert.deepEqual(fs.readFileSync(path.join(root, "local-test.html")), original);
  assert.match(original.toString("utf8"), /Nothing is uploaded or automatically saved/);
});

test("a decoder change updates the private parent's URL using the public lazy-import transformation", t => {
  const root = fixture(t);
  buildOwnerStudio({ root });
  const first = fs.readFileSync(path.join(root, destinationName), "utf8");
  fs.appendFileSync(path.join(root, "vendor/heic-to/heic-to.js"), "// decoder revision\n");
  assert.throws(() => buildOwnerStudio({ root, check: true }), /differs/);
  assert.equal(fs.readFileSync(path.join(root, destinationName), "utf8"), first, "check mode cannot rewrite a stale installed template");
  buildOwnerStudio({ root });
  const second = fs.readFileSync(path.join(root, destinationName), "utf8");
  assertAssetHashes(second, addContentVersions(assetContents(root)));
  const select = (html, name) => assetReferences(html).find(reference => reference.includes(`${name}?`));
  assert.notEqual(select(first, "scripts.js"), select(second, "scripts.js"));
  assert.equal(select(first, "local-test.js"), select(second, "local-test.js"));
  assert.equal(select(first, "styles.css"), select(second, "styles.css"));
});

test("asset-root replacement preserves query options, fragments and inactive examples", t => {
  const root = fixture(t);
  const assets = assetContents(root);
  const comment = '<!-- <link rel="stylesheet" href="private-example.css"> -->';
  const source = fs.readFileSync(path.join(root, "local-test.html"), "utf8")
    .replace('href="styles.css"', 'href=styles.css?theme=dark&amp;v=old#palette') + comment;
  const html = ownerStudioSource(source, assets);
  assertAssetHashes(html.replace(comment, ""), addContentVersions(assets));
  assert.ok(html.includes(comment), "commented examples must remain unchanged");
  const reference = assetReferences(html).find(reference => reference.startsWith(ASSET_ROOT) && reference.includes("styles.css?"));
  const url = new URL(reference.slice(ASSET_ROOT.length), "https://site.example/");
  assert.equal(url.searchParams.get("theme"), "dark");
  assert.equal(url.hash, "#palette");
});

test("check mode detects source and asset changes without creating or changing the generated file", t => {
  const root = fixture(t);
  const destination = path.join(root, destinationName);
  assert.throws(() => buildOwnerStudio({ root, check: true }), /differs/);
  assert.equal(fs.existsSync(destination), false);
  buildOwnerStudio({ root });
  const first = fs.readFileSync(destination);
  assert.equal(buildOwnerStudio({ root, check: true }), destination);
  assert.deepEqual(fs.readFileSync(destination), first);
  fs.appendFileSync(path.join(root, "local-test.html"), "\n<!-- wording revision -->\n");
  assert.throws(() => buildOwnerStudio({ root, check: true }), /differs/);
  assert.deepEqual(fs.readFileSync(destination), first);
  buildOwnerStudio({ root });
  const second = fs.readFileSync(destination);
  fs.appendFileSync(path.join(root, "owner-studio.js"), "// adapter revision\n");
  assert.throws(() => buildOwnerStudio({ root, check: true }), /differs/);
  assert.deepEqual(fs.readFileSync(destination), second);
});

test("unsafe or incomplete canonical markup fails before changing the previous private template", t => {
  const root = fixture(t);
  const page = path.join(root, "local-test.html");
  const original = fs.readFileSync(page, "utf8");
  buildOwnerStudio({ root });
  const destination = path.join(root, destinationName);
  const previous = fs.readFileSync(destination);
  const invalid = [
    original.replace(/<body\b/, '<body data-owner-studio="true"'),
    original.replace(/id="test-note"/, 'id="other-note"'),
    original.replace(/src="local-test\.js"/, 'src="missing-local-test.js"'),
    original + '<script src="owner-studio.js" defer></script>',
    original + '<p style="color:red">private inline styles</p>',
    original + '<a href="README.md">private notes</a>'
  ];
  for (const source of invalid) {
    fs.writeFileSync(page, source);
    assert.throws(() => buildOwnerStudio({ root }), /needs|external files|unpublished file/);
    assert.deepEqual(fs.readFileSync(destination), previous);
  }
});

test("a missing or symlinked static asset cannot overwrite the previous private template", t => {
  const root = fixture(t);
  buildOwnerStudio({ root });
  const destination = path.join(root, destinationName);
  const previous = fs.readFileSync(destination);
  const filename = path.join(root, "owner-studio.js");
  fs.renameSync(filename, path.join(root, "unselected-private-file"));
  assert.throws(() => buildOwnerStudio({ root }), /ENOENT/);
  assert.deepEqual(fs.readFileSync(destination), previous);
  fs.symlinkSync(path.join(root, "unselected-private-file"), filename);
  assert.throws(() => buildOwnerStudio({ root }), /not a symlink/);
  assert.deepEqual(fs.readFileSync(destination), previous);
});

test("empty or invalid static code leaves the previous private template intact", t => {
  const root = fixture(t);
  buildOwnerStudio({ root });
  const destination = path.join(root, destinationName);
  const previous = fs.readFileSync(destination);
  const filename = path.join(root, "owner-studio.js");
  fs.writeFileSync(filename, "");
  assert.throws(() => buildOwnerStudio({ root }), /empty/);
  assert.deepEqual(fs.readFileSync(destination), previous);
  fs.writeFileSync(filename, "function invalid(");
  assert.throws(() => buildOwnerStudio({ root }), SyntaxError);
  assert.deepEqual(fs.readFileSync(destination), previous);
});
