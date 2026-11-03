"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { parse } = require("./vendor/es-module-lexer/lexer.cjs");
const { renderSiteHeader, siteNameFromTemplate } = require("../site-header.js");
const { embedReflections } = require("../reflections.js");

const ORIGINAL_PUBLIC_FILES = Object.freeze([
  "index.html", "styles.css", "scripts.js", "project-config.js",
  "archive-workflow.js", "drive-storage.js", "drive-bridge.js"
]);
const PREVIOUS_PUBLIC_FILES = Object.freeze([...ORIGINAL_PUBLIC_FILES, "artist-import.js", "artist-import.css"]);
const SPLIT_PUBLIC_FILES = Object.freeze([...PREVIOUS_PUBLIC_FILES, "double-exposure.html"]);
const EXPERIMENT_PUBLIC_FILES = Object.freeze([
  ...SPLIT_PUBLIC_FILES, "experiment-1.html", "experiment-2.html", "experiment-3.html"
]);
const CATALOGUE_FILE = "assets/base-photos.json";
const PHOTO_DIRECTORY = "assets/base-photos";
const MAX_PHOTO_BYTES = 30 * 1024 * 1024;
const STATIC_PUBLIC_FILES = Object.freeze([...EXPERIMENT_PUBLIC_FILES, "base-assets.js", CATALOGUE_FILE]);
const HEIC_PUBLIC_FILES = Object.freeze([
  "heic-input.js", "vendor/heic-to/heic-to.js", "vendor/heic-to/LICENSE",
  "vendor/heic-to/NOTICE.txt", "vendor/heic-to/SOURCES.tar.gz"
]);
const PREBUILT_PUBLIC_FILES = Object.freeze([...STATIC_PUBLIC_FILES, ...HEIC_PUBLIC_FILES]);
const MARKED_PUBLIC_FILES = Object.freeze([...PREBUILT_PUBLIC_FILES, ".nojekyll"]);
const GALLERY_FILES = Object.freeze(["experiment-carousel.css", "experiment-carousel.js"]);
const REFLECTION_FILES = Object.freeze(["reflections.css", "reflections.js"]);
const OWNER_STUDIO_FILES = Object.freeze([
  "local-test.js", "local-test.css", "film-renderer.js", "tone-adjustments.js", "owner-studio.js"
]);
const HEADER_TEMPLATE = "includes/site-header.html";
const HEADER_SCRIPT = "site-header.js";
const NON_HTML_PUBLIC_FILES = Object.freeze([
  ...MARKED_PUBLIC_FILES.filter(name => !name.endsWith(".html")), ...GALLERY_FILES, ...REFLECTION_FILES, HEADER_SCRIPT, ...OWNER_STUDIO_FILES
]);
function publicSourceFiles(root) {
  const pages = fs.readdirSync(root).filter(name => !name.startsWith(".") && /\.html$/i.test(name) && name !== "local-test.html").sort();
  if (!pages.includes("index.html")) throw new Error("The public website needs index.html.");
  return [...NON_HTML_PUBLIC_FILES, ...pages];
}
const PUBLIC_FILES = Object.freeze(publicSourceFiles(path.resolve(__dirname, "..")));
const GALLERY_DIRECTORY = "images";
const GALLERY_CATALOGUE_FILE = "assets/gallery-photos.json";
const MODULE_FILES = new Set(["heic-input.js", "vendor/heic-to/heic-to.js"]);
const OUTPUT_DIRECTORY = ".public-site";

function validateHtml(source, page, publicFiles) {
  const html = source.replace(/<!--[\s\S]*?-->/g, "");
  if (/<style\b|\sstyle\s*=|\son[a-z]+\s*=|javascript\s*:/i.test(html)) {
    throw new Error(`${page} must keep styles and executable code in external files.`);
  }
  for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (body.trim() || !/\bsrc\s*=\s*(?:"[^"]+"|'[^']+'|[^\s>]+)/i.test(attributes)) {
      throw new Error(`${page} must load JavaScript from external files only.`);
    }
  }
  for (const match of html.matchAll(/\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const reference = match[1] ?? match[2] ?? match[3];
    if (reference.startsWith("#")) continue;
    let filename;
    try { filename = reference === "./" ? "index.html" : decodeURIComponent(reference.split(/[?#]/)[0].replace(/^\.\//, "")); } catch {}
    if (!publicFiles.has(filename)) {
      throw new Error(`${page} references an unpublished file: ${reference}`);
    }
  }
}

function readRegularFile(root, name, generated = false, maxBytes = Infinity) {
  const parts = name.split("/");
  for (let index = 1; index < parts.length; index++) {
    const directory = fs.lstatSync(path.join(root, ...parts.slice(0, index)));
    if (!directory.isDirectory() || directory.isSymbolicLink()) {
      throw new Error(`${name} must use regular directories, not a symlink.`);
    }
  }
  const filename = path.join(root, name);
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(generated ? `${name} is not a regular generated file; nothing was replaced.`
      : `${name} must be a regular source file, not a symlink.`);
  }
  if (stat.size > maxBytes) throw new Error(`${name} exceeds the 30 MiB photo limit.`);
  return fs.readFileSync(filename);
}

function readCatalogue(bytes, gallery = false) {
  const label = gallery ? GALLERY_CATALOGUE_FILE : CATALOGUE_FILE;
  let catalogue;
  try { catalogue = JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error(`${label} must contain valid JSON.`); }
  if (catalogue?.version !== 1 || !Array.isArray(catalogue.photos)) {
    throw new Error(`${label} must contain a version 1 photo catalogue.`);
  }
  const names = new Set();
  const hashes = new Set();
  for (const photo of catalogue.photos) {
    const parts = typeof photo?.path === "string" ? photo.path.split("/") : [];
    const safeGalleryPath = parts.length > 1 && parts[0] === GALLERY_DIRECTORY
      && parts.every(part => part && !part.startsWith(".") && !/[\\\p{Cc}]/u.test(part));
    if (!photo || typeof photo.name !== "string" || !photo.name || photo.name === "." || photo.name === ".."
      || /[\/\\\p{Cc}]/u.test(photo.name) || !/\.(?:jpe?g|png|webp|avif)$/i.test(photo.name)
      || (gallery ? !safeGalleryPath || parts.at(-1) !== photo.name : photo.path !== `${PHOTO_DIRECTORY}/${photo.name}`)) {
      throw new Error(`${label} contains an unsafe or unsupported photo path.`);
    }
    if (!/^[a-f0-9]{64}$/i.test(photo.sha256) || !Number.isSafeInteger(photo.byteLength)
      || photo.byteLength < 1 || (!gallery && photo.byteLength > MAX_PHOTO_BYTES)
      || !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(photo.mimeType)) {
      throw new Error(`${label} contains invalid photo metadata.`);
    }
    const hash = photo.sha256.toLowerCase();
    if (names.has(photo.path) || (!gallery && hashes.has(hash))) {
      throw new Error(`${label} contains a duplicate photo path or SHA-256 hash.`);
    }
    names.add(photo.path);
    hashes.add(hash);
  }
  return catalogue.photos;
}

function validatePhoto(bytes, photo) {
  if (bytes.length !== photo.byteLength || createHash("sha256").update(bytes).digest("hex") !== photo.sha256.toLowerCase()) {
    throw new Error(`${photo.path} does not match its catalogue size or SHA-256 hash.`);
  }
  const signatureMatches = {
    "image/jpeg": () => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    "image/png": () => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/webp": () => bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP",
    "image/avif": () => bytes.toString("ascii", 4, 8) === "ftyp"
      && ["avif", "avis"].some((brand) => bytes.subarray(8, Math.min(bytes.length, 64)).includes(Buffer.from(brand)))
  };
  if (!signatureMatches[photo.mimeType]()) throw new Error(`${photo.path} has an unrecognized image signature.`);
}

function readGallery(root, sourceFiles) {
  const selected = new Set();
  const files = new Map();
  const photos = [];
  for (const page of sourceFiles.filter(name => name.endsWith(".html"))) {
    const html = readRegularFile(root, page).toString("utf8").replace(/<!--[\s\S]*?-->/g, "");
    for (const match of html.matchAll(/\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
      const reference = match[1] ?? match[2] ?? match[3];
      let filename;
      try { filename = decodeURIComponent(reference.split(/[?#]/)[0].replace(/^\.\//, "")); } catch { continue; }
      if (!filename.startsWith(`${GALLERY_DIRECTORY}/`)) continue;
      const parts = filename.split("/");
      if (parts.some(part => !part || part.startsWith(".") || /[\\\p{Cc}]/u.test(part))) {
        throw new Error(`${page} references an unsafe gallery path: ${reference}`);
      }
      selected.add(filename);
    }
  }
  for (const filename of [...selected].sort()) {
    const name = path.posix.basename(filename);
    const extension = path.extname(name).toLowerCase();
    const mimeType = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
      ".webp": "image/webp", ".avif": "image/avif" }[extension];
    if (!mimeType) throw new Error(`${filename} is not a supported gallery image.`);
    const bytes = readRegularFile(root, filename);
    const photo = { path: filename, name, mimeType, byteLength: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex") };
    validatePhoto(bytes, photo);
    photos.push(photo);
    files.set(filename, bytes);
  }
  return { photos, files };
}

function validateJavaScript(bytes, filename) {
  if (!MODULE_FILES.has(filename)) {
    new vm.Script(bytes.toString("utf8"), { filename });
    return;
  }
  const result = spawnSync(process.execPath, ["--input-type=module", "--check"], {
    input: bytes, encoding: "utf8", timeout: 10000, maxBuffer: 8 * 1024 * 1024
  });
  if (result.error || result.status !== 0) {
    const detail = String(result.error?.message || result.stderr || "Syntax check failed").slice(0, 1000);
    throw new SyntaxError(`${filename} contains invalid JavaScript module syntax. ${detail}`);
  }
}

function addContentVersions(contents) {
  const output = new Map(contents);
  const hashes = new Map();
  const visiting = new Set();

  function versionUrl(reference, owner) {
    const fragmentAt = reference.indexOf("#");
    const fragment = fragmentAt < 0 ? "" : reference.slice(fragmentAt);
    const address = fragmentAt < 0 ? reference : reference.slice(0, fragmentAt);
    const queryAt = address.indexOf("?");
    const pathname = queryAt < 0 ? address : address.slice(0, queryAt);
    const filename = path.posix.normalize(path.posix.join(path.posix.dirname(owner), decodeURIComponent(pathname)));
    if (!contents.has(filename) || !/\.(?:css|js)$/.test(filename)) {
      throw new Error(`${owner} references an unpublished CSS or JavaScript file: ${reference}`);
    }
    const query = new URLSearchParams(queryAt < 0 ? "" : address.slice(queryAt + 1));
    query.set("v", hashFile(filename));
    return `${pathname}?${query}${fragment}`;
  }

  function hashFile(filename) {
    if (hashes.has(filename)) return hashes.get(filename);
    if (visiting.has(filename)) throw new Error(`Circular script imports cannot be versioned: ${filename}`);
    visiting.add(filename);
    let bytes = contents.get(filename);
    if (filename.endsWith(".js") && !filename.startsWith("vendor/")) {
      // Version lazy imports before hashing the script that loads them.
      let source = bytes.toString("utf8");
      const [imports] = parse(source, filename);
      for (const entry of [...imports].reverse()) {
        if (entry.type === "import-meta") continue;
        if (!entry.specifier || entry.glob) throw new Error(`${filename} needs a literal import URL for automatic cache labels.`);
        if (!entry.specifier.startsWith(".")) continue;
        const url = versionUrl(entry.specifier, filename);
        const start = entry.type === "dynamic" ? entry.start : entry.start - 1;
        const end = entry.type === "dynamic" ? entry.end : entry.end + 1;
        source = source.slice(0, start) + JSON.stringify(url) + source.slice(end);
      }
      bytes = Buffer.from(source);
    }
    output.set(filename, bytes);
    const hash = createHash("sha256").update(bytes).digest("hex");
    hashes.set(filename, hash);
    visiting.delete(filename);
    return hash;
  }

  for (const filename of contents.keys()) if (/\.(?:css|js)$/.test(filename)) hashFile(filename);
  for (const [filename, bytes] of contents) {
    if (!filename.endsWith(".html")) continue;
    const html = bytes.toString("utf8").replace(/<!--[\s\S]*?-->|(\b(?:src|href)\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
      (match, attribute, double, single, unquoted) => {
        if (!attribute) return match;
        const reference = double ?? single ?? unquoted;
        if (!/\.(?:css|js)(?:[?#]|$)/.test(reference)) return match;
        const quote = double !== undefined ? '"' : single !== undefined ? "'" : "";
        const versioned = versionUrl(reference.replace(/&amp;/g, "&"), filename).replace(/&/g, "&amp;");
        return `${attribute}${quote}${versioned}${quote}`;
      });
    output.set(filename, Buffer.from(html));
  }
  return output;
}

function validatePreviousOutput(destination) {
  let stat;
  try { stat = fs.lstatSync(destination); } catch (error) { if (error.code === "ENOENT") return; throw error; }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${OUTPUT_DIRECTORY} must be a generated directory, not a file or symlink.`);
  }
  const entries = fs.readdirSync(destination).sort();
  const legacyVersion = [EXPERIMENT_PUBLIC_FILES, SPLIT_PUBLIC_FILES, PREVIOUS_PUBLIC_FILES, ORIGINAL_PUBLIC_FILES].find((files) => {
    const expected = [...files].sort();
    return entries.length === expected.length && entries.every((name, index) => name === expected[index]);
  });
  if (legacyVersion) {
    for (const name of legacyVersion) readRegularFile(destination, name, true);
    return;
  }

  let photos;
  try { photos = readCatalogue(readRegularFile(destination, CATALOGUE_FILE, true)); }
  catch (error) { throw new Error(`${OUTPUT_DIRECTORY} contains unexpected files or an invalid catalogue; nothing was replaced. ${error.message}`); }
  const hasGallery = fs.existsSync(path.join(destination, GALLERY_CATALOGUE_FILE));
  const galleryBytes = hasGallery ? readRegularFile(destination, GALLERY_CATALOGUE_FILE, true) : null;
  const gallery = hasGallery ? readCatalogue(galleryBytes, true) : [];
  const galleryManifest = hasGallery ? JSON.parse(galleryBytes) : null;
  const pages = hasGallery ? galleryManifest.pages : [];
  if (hasGallery && (!Array.isArray(pages) || !pages.includes("index.html") || new Set(pages).size !== pages.length
    || pages.some(name => typeof name !== "string" || name.startsWith(".") || /[\/\\\p{Cc}]/u.test(name)
      || !/\.html$/i.test(name) || name === "local-test.html"))) {
    throw new Error(`${OUTPUT_DIRECTORY} contains an invalid gallery page catalogue; nothing was replaced.`);
  }
  if (!hasGallery && GALLERY_FILES.some(name => entries.includes(name))) {
    throw new Error(`${OUTPUT_DIRECTORY} is missing its gallery catalogue; nothing was replaced.`);
  }
  if (hasGallery && galleryManifest.ownerStudioAssetsVersion !== undefined && galleryManifest.ownerStudioAssetsVersion !== 1) {
    throw new Error(`${OUTPUT_DIRECTORY} contains an invalid owner-studio asset version; nothing was replaced.`);
  }
  const expectsOwnerStudio = hasGallery && (galleryManifest.ownerStudioAssetsVersion === 1
    || OWNER_STUDIO_FILES.some(name => entries.includes(name)));
  // Complete earlier releases have neither carousel files nor a gallery catalogue.
  const expectsHeaderScript = hasGallery && pages.some(page => {
    if (!fs.existsSync(path.join(destination, page))) return false;
    const html = readRegularFile(destination, page, true).toString("utf8").replace(/<!--[\s\S]*?-->/g, "");
    return /\bdata-site-header-rendered\b|<script\b[^>]*\bsrc=["']site-header\.js(?:[?"'])/i.test(html);
  });
  const galleryCoreFiles = NON_HTML_PUBLIC_FILES.filter(name =>
    (name !== HEADER_SCRIPT || expectsHeaderScript || entries.includes(HEADER_SCRIPT))
    && (!REFLECTION_FILES.includes(name) || pages.includes("reflections.html"))
    && (!OWNER_STUDIO_FILES.includes(name) || expectsOwnerStudio));
  const coreFiles = hasGallery ? [...galleryCoreFiles, ...pages] : entries.includes(".nojekyll") ? MARKED_PUBLIC_FILES
    : entries.includes("heic-input.js") || entries.includes("vendor") ? PREBUILT_PUBLIC_FILES : STATIC_PUBLIC_FILES;
  const expectedFiles = new Set([...coreFiles, ...photos.map((photo) => photo.path),
    ...(hasGallery ? [GALLERY_CATALOGUE_FILE, ...gallery.map(photo => photo.path)] : [])]);
  const expectedDirectories = new Set();
  for (const filename of expectedFiles) {
    const parts = filename.split("/");
    for (let index = 1; index < parts.length; index++) expectedDirectories.add(parts.slice(0, index).join("/"));
  }
  function visit(relative = "") {
    for (const name of fs.readdirSync(path.join(destination, relative))) {
      const filename = relative ? `${relative}/${name}` : name;
      const entry = fs.lstatSync(path.join(destination, filename));
      if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) {
        throw new Error(`${OUTPUT_DIRECTORY}/${filename} is not a regular generated file; nothing was replaced.`);
      }
      if (entry.isDirectory() && expectedDirectories.has(filename)) visit(filename);
      else if (entry.isFile() && expectedFiles.has(filename)) expectedFiles.delete(filename);
      else throw new Error(`${OUTPUT_DIRECTORY} contains unexpected files; nothing was replaced.`);
    }
  }
  visit();
  if (expectedFiles.size) throw new Error(`${OUTPUT_DIRECTORY} contains unexpected files or is missing required files; nothing was replaced.`);
  for (const photo of photos) validatePhoto(readRegularFile(destination, photo.path, true, MAX_PHOTO_BYTES), photo);
  for (const photo of gallery) validatePhoto(readRegularFile(destination, photo.path, true), photo);
}

function headerAttribute(attributes, name) {
  const match = attributes.match(new RegExp(`\\b${name}(?=[\\s=>]|$)(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+)))?`, "i"));
  return match ? match[1] ?? match[2] ?? match[3] ?? "" : null;
}

function embedSiteHeader(source, page, template) {
  const name = siteNameFromTemplate(template);
  const attributeName = name.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const html = source.replace(/<!--[\s\S]*?-->|<div\b([^>]*\bdata-site-header(?=[\s=>])[^>]*)>\s*<\/div>|<title\b([^>]*)>[\s\S]*?<\/title>|<meta\b([^>]*)>/gi,
    (match, headerAttributes, titleAttributes, metaAttributes) => {
      if (match.startsWith("<!--")) return match;
      if (headerAttributes !== undefined) {
        const header = renderSiteHeader(template, { page, showExperiments: headerAttribute(headerAttributes, "data-site-header") === "experiments" });
        return `<div${headerAttributes} data-site-header-rendered>${header}</div>`;
      }
      if (titleAttributes !== undefined && headerAttribute(titleAttributes, "data-site-name") !== null) {
        return `<title${titleAttributes}>${name}</title>`;
      }
      if (metaAttributes !== undefined && headerAttribute(metaAttributes, "data-site-name") !== null) {
        const attribute = /\bcontent\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i;
        if (!attribute.test(metaAttributes)) throw new Error(`${page} needs a content attribute on its shared site-name metadata.`);
        return `<meta${metaAttributes.replace(attribute, () => `content="${attributeName}"`)}>`;
      }
      return match;
    });
  const active = html.replace(/<!--[\s\S]*?-->/g, "");
  if (/<div\b(?=[^>]*\bdata-site-header(?=[\s=>]))(?![^>]*\bdata-site-header-rendered\b)[^>]*>/i.test(active)) {
    throw new Error(`${page}: the shared-header slot must be empty so the prepared page can include its complete header.`);
  }
  return html;
}

function preparePublicSite(root = path.resolve(__dirname, "..")) {
  root = path.resolve(root);
  const destination = path.join(root, OUTPUT_DIRECTORY);
  // Read and validate everything before touching the previous publication.
  const sourceFiles = publicSourceFiles(root);
  const contents = new Map(sourceFiles.map((name) => {
    const bytes = readRegularFile(root, name);
    if (!bytes.length && name !== ".nojekyll") throw new Error(`${name} is empty; nothing was published.`);
    if (name.endsWith(".js")) validateJavaScript(bytes, name);
    return [name, bytes];
  }));
  for (const photo of readCatalogue(contents.get(CATALOGUE_FILE))) {
    const bytes = readRegularFile(root, photo.path, false, MAX_PHOTO_BYTES);
    validatePhoto(bytes, photo);
    contents.set(photo.path, bytes);
  }
  const gallery = readGallery(root, sourceFiles);
  for (const [filename, bytes] of gallery.files) contents.set(filename, bytes);
  contents.set(GALLERY_CATALOGUE_FILE, Buffer.from(JSON.stringify({ version: 1, ownerStudioAssetsVersion: 1,
    pages: sourceFiles.filter(name => name.endsWith(".html")), photos: gallery.photos }, null, 2) + "\n"));
  const publicFiles = new Set(contents.keys());
  const template = readRegularFile(root, HEADER_TEMPLATE).toString("utf8");
  validateHtml(template, HEADER_TEMPLATE, publicFiles);
  const sourcePages = new Map([...contents].filter(([page]) => page.endsWith(".html"))
    .map(([page, content]) => [page, content.toString("utf8")]));
  for (const [name, bytes] of contents) {
    if (name.endsWith(".html")) {
      const html = embedReflections(bytes.toString("utf8"), sourcePages);
      contents.set(name, Buffer.from(embedSiteHeader(html, name, template)));
    }
  }
  for (const [name, bytes] of contents) {
    if (name.endsWith(".html")) validateHtml(bytes.toString("utf8"), name, publicFiles);
  }
  const versionedContents = addContentVersions(contents);
  for (const [name, bytes] of versionedContents) {
    if (name.endsWith(".html")) validateHtml(bytes.toString("utf8"), name, publicFiles);
    if (name.endsWith(".js") && !bytes.equals(contents.get(name))) validateJavaScript(bytes, name);
  }
  validatePreviousOutput(destination);

  const staging = fs.mkdtempSync(path.join(root, ".public-site-stage-"));
  const next = path.join(staging, "next");
  const previous = path.join(staging, "previous");
  let movedPrevious = false;
  let installed = false;
  try {
    fs.mkdirSync(next);
    for (const [name, bytes] of versionedContents) {
      const filename = path.join(next, name);
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, bytes, { flag: "wx" });
    }
    if (fs.existsSync(destination)) {
      fs.renameSync(destination, previous);
      movedPrevious = true;
    }
    try {
      fs.renameSync(next, destination);
      installed = true;
    } catch (error) {
      if (movedPrevious) fs.renameSync(previous, destination);
      throw error;
    }
  } finally {
    // If both installation and rollback fail, preserve the old files in staging
    // rather than deleting the remaining copy while reporting the failure.
    if (installed || !fs.existsSync(previous)) fs.rmSync(staging, { recursive: true, force: true });
  }
  return destination;
}

module.exports = { PUBLIC_FILES, OWNER_STUDIO_FILES, OUTPUT_DIRECTORY, preparePublicSite,
  addContentVersions, validateHtml, validateJavaScript, readRegularFile };

if (require.main === module) {
  try {
    if (process.argv.length > 2) throw new Error("Usage: node scripts/prepare-public-site.cjs (no destination argument)");
    console.log(`Prepared the public website in ${preparePublicSite()}`);
  } catch (error) {
    console.error(`Public site preparation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
