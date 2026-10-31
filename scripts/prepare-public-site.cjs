"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createHash } = require("node:crypto");

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
const PUBLIC_FILES = Object.freeze([...EXPERIMENT_PUBLIC_FILES, "base-assets.js", CATALOGUE_FILE]);
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
    try { filename = decodeURIComponent(reference.split(/[?#]/)[0].replace(/^\.\//, "")); } catch {}
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

function readCatalogue(bytes) {
  let catalogue;
  try { catalogue = JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error(`${CATALOGUE_FILE} must contain valid JSON.`); }
  if (catalogue?.version !== 1 || !Array.isArray(catalogue.photos)) {
    throw new Error(`${CATALOGUE_FILE} must contain a version 1 photo catalogue.`);
  }
  const names = new Set();
  const hashes = new Set();
  for (const photo of catalogue.photos) {
    if (!photo || typeof photo.name !== "string" || !photo.name || photo.name === "." || photo.name === ".."
      || /[\/\\\p{Cc}]/u.test(photo.name) || !/\.(?:jpe?g|png|webp|avif)$/i.test(photo.name)
      || photo.path !== `${PHOTO_DIRECTORY}/${photo.name}`) {
      throw new Error(`${CATALOGUE_FILE} contains an unsafe or unsupported photo path.`);
    }
    if (!/^[a-f0-9]{64}$/i.test(photo.sha256) || !Number.isSafeInteger(photo.byteLength)
      || photo.byteLength < 1 || photo.byteLength > MAX_PHOTO_BYTES
      || !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(photo.mimeType)) {
      throw new Error(`${CATALOGUE_FILE} contains invalid photo metadata.`);
    }
    const hash = photo.sha256.toLowerCase();
    if (names.has(photo.path) || hashes.has(hash)) {
      throw new Error(`${CATALOGUE_FILE} contains a duplicate photo path or SHA-256 hash.`);
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
  const expectedFiles = new Set([...PUBLIC_FILES, ...photos.map((photo) => photo.path)]);
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
}

function preparePublicSite(root = path.resolve(__dirname, "..")) {
  root = path.resolve(root);
  const destination = path.join(root, OUTPUT_DIRECTORY);
  // Read and validate everything before touching the previous publication.
  const contents = new Map(PUBLIC_FILES.map((name) => {
    const bytes = readRegularFile(root, name);
    if (!bytes.length) throw new Error(`${name} is empty; nothing was published.`);
    if (name.endsWith(".js")) new vm.Script(bytes.toString("utf8"), { filename: name });
    return [name, bytes];
  }));
  for (const photo of readCatalogue(contents.get(CATALOGUE_FILE))) {
    const bytes = readRegularFile(root, photo.path, false, MAX_PHOTO_BYTES);
    validatePhoto(bytes, photo);
    contents.set(photo.path, bytes);
  }
  const publicFiles = new Set(contents.keys());
  for (const [name, bytes] of contents) {
    if (name.endsWith(".html")) validateHtml(bytes.toString("utf8"), name, publicFiles);
  }
  validatePreviousOutput(destination);

  const staging = fs.mkdtempSync(path.join(root, ".public-site-stage-"));
  const next = path.join(staging, "next");
  const previous = path.join(staging, "previous");
  let movedPrevious = false;
  let installed = false;
  try {
    fs.mkdirSync(next);
    for (const [name, bytes] of contents) {
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

module.exports = { PUBLIC_FILES, OUTPUT_DIRECTORY, preparePublicSite };

if (require.main === module) {
  try {
    if (process.argv.length > 2) throw new Error("Usage: node scripts/prepare-public-site.cjs (no destination argument)");
    console.log(`Prepared the public website in ${preparePublicSite()}`);
  } catch (error) {
    console.error(`Public site preparation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
