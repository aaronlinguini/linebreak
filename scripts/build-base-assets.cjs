"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PHOTO_DIRECTORY = "assets/base-photos";
const MANIFEST_FILE = "assets/base-photos.json";
const CATALOG_FILE = "google-apps-script/AssetCatalog.gs";
const MAX_PHOTO_BYTES = 30 * 1024 * 1024;
const MIME_TYPES = Object.freeze({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif" });

function directory(root, relative) {
  let current = root;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    const entry = fs.lstatSync(current);
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error(`${relative} must be a real directory, not a symlink.`);
    }
  }
  return current;
}

function imageMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length >= 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 16 && bytes.toString("latin1", 4, 8) === "ftyp") {
    const boxSize = bytes.readUInt32BE(0);
    if (boxSize >= 16 && boxSize <= bytes.length) {
      if (/^avi[fs]$/.test(bytes.toString("latin1", 8, 12))) return "image/avif";
      for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
        if (/^avi[fs]$/.test(bytes.toString("latin1", offset, offset + 4))) return "image/avif";
      }
    }
  }
  return "";
}

function readPhotos(root) {
  const source = directory(root, PHOTO_DIRECTORY);
  const photos = [], hashes = new Set();
  for (const name of fs.readdirSync(source).sort()) {
    if (!name || name === "." || name === ".." || /[\\/\p{Cc}]/u.test(name)) {
      throw new Error(`Unsafe base-photo filename: ${JSON.stringify(name)}.`);
    }
    const filename = path.join(source, name);
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Base photo ${JSON.stringify(name)} must be a regular file, not a symlink or directory.`);
    }
    if (name === ".DS_Store") continue;
    const mimeType = MIME_TYPES[path.extname(name).toLowerCase()];
    if (!mimeType) throw new Error(`Unsupported file ${JSON.stringify(name)}. Use JPEG, PNG, WebP, or AVIF photographs only.`);
    if (stat.size < 1 || stat.size > MAX_PHOTO_BYTES) {
      throw new Error(`Base photo ${JSON.stringify(name)} must contain between 1 byte and 30 MiB.`);
    }
    const bytes = fs.readFileSync(filename);
    if (bytes.length !== stat.size) throw new Error(`Base photo ${JSON.stringify(name)} changed while it was being read. Retry the build.`);
    if (imageMime(bytes) !== mimeType) {
      throw new Error(`The content signature of ${JSON.stringify(name)} does not match its file extension.`);
    }
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    if (hashes.has(sha256)) continue;
    hashes.add(sha256);
    photos.push({ path: `${PHOTO_DIRECTORY}/${name}`, name, sha256, mimeType, byteLength: bytes.length });
  }
  if (!photos.length) throw new Error(`Add at least one supported photograph to ${PHOTO_DIRECTORY} before building the catalog.`);
  return photos;
}

function existingOutput(filename) {
  let stat;
  try { stat = fs.lstatSync(filename); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Generated output must be a regular file, not a symlink: ${filename}`);
  return fs.readFileSync(filename);
}

function replaceOutputs(outputs) {
  const staged = [], replaced = [];
  try {
    for (const output of outputs) {
      const temporary = `${output.filename}.tmp-${crypto.randomUUID()}`;
      const descriptor = fs.openSync(temporary, "wx");
      staged.push({ ...output, temporary });
      try { fs.writeFileSync(descriptor, output.content); }
      finally { fs.closeSync(descriptor); }
    }
    for (const output of staged) {
      fs.renameSync(output.temporary, output.filename);
      replaced.push(output);
    }
  } catch (error) {
    for (const output of replaced.reverse()) {
      if (output.previous === null) fs.unlinkSync(output.filename);
      else {
        const rollback = `${output.filename}.tmp-${crypto.randomUUID()}`;
        staged.push({ temporary: rollback });
        fs.writeFileSync(rollback, output.previous, { flag: "wx" });
        fs.renameSync(rollback, output.filename);
      }
    }
    throw error;
  } finally {
    for (const output of staged) fs.rmSync(output.temporary, { force: true });
  }
}

function buildBaseAssets({ check = false, root = path.resolve(__dirname, "..") } = {}) {
  root = path.resolve(root);
  const manifest = { version: 1, photos: readPhotos(root) };
  const json = JSON.stringify(manifest, null, 2);
  directory(root, "google-apps-script");
  const outputs = [
    { relative: MANIFEST_FILE, content: `${json}\n` },
    { relative: CATALOG_FILE, content: `function artistAssetCatalog_() {\n  return ${json};\n}\n` }
  ].map(output => {
    const filename = path.join(root, output.relative);
    return { ...output, filename, previous: existingOutput(filename) };
  });
  if (check) {
    for (const output of outputs) {
      if (output.previous === null || !output.previous.equals(Buffer.from(output.content))) {
        throw new Error(`${output.relative} does not match the selected photographs. Run node scripts/build-base-assets.cjs.`);
      }
    }
  } else replaceOutputs(outputs);
  return manifest;
}

module.exports = { buildBaseAssets, MAX_PHOTO_BYTES };

if (require.main === module) {
  try {
    const arguments_ = process.argv.slice(2);
    if (arguments_.length > 1 || (arguments_.length && arguments_[0] !== "--check")) {
      throw new Error("Usage: node scripts/build-base-assets.cjs [--check]");
    }
    const check = arguments_[0] === "--check";
    const manifest = buildBaseAssets({ check });
    console.log(check ? "Base-photo manifest and Google catalog match the selected photographs."
      : `Built the base-photo manifest and Google catalog for ${manifest.photos.length} unique photographs.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
