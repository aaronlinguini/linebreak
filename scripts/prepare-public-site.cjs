"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ORIGINAL_PUBLIC_FILES = Object.freeze([
  "index.html", "styles.css", "scripts.js", "project-config.js",
  "archive-workflow.js", "drive-storage.js", "drive-bridge.js"
]);
const PUBLIC_FILES = Object.freeze([...ORIGINAL_PUBLIC_FILES, "artist-import.js", "artist-import.css"]);
const OUTPUT_DIRECTORY = ".public-site";

function validateHtml(source) {
  const html = source.replace(/<!--[\s\S]*?-->/g, "");
  if (/<style\b|\sstyle\s*=|\son[a-z]+\s*=|javascript\s*:/i.test(html)) {
    throw new Error("index.html must keep styles and executable code in external files.");
  }
  for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (body.trim() || !/\bsrc\s*=\s*(?:"[^"]+"|'[^']+'|[^\s>]+)/i.test(attributes)) {
      throw new Error("index.html must load JavaScript from external files only.");
    }
  }
  for (const match of html.matchAll(/\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const reference = match[1] ?? match[2] ?? match[3];
    if (reference.startsWith("#")) continue;
    const filename = reference.split(/[?#]/)[0].replace(/^\.\//, "");
    if (!PUBLIC_FILES.includes(filename)) {
      throw new Error(`index.html references an unpublished file: ${reference}`);
    }
  }
}

function validatePreviousOutput(destination) {
  let stat;
  try { stat = fs.lstatSync(destination); } catch (error) { if (error.code === "ENOENT") return; throw error; }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${OUTPUT_DIRECTORY} must be a generated directory, not a file or symlink.`);
  }
  const entries = fs.readdirSync(destination).sort();
  const knownVersion = [PUBLIC_FILES, ORIGINAL_PUBLIC_FILES].some((files) => {
    const expected = [...files].sort();
    return entries.length === expected.length && entries.every((name, index) => name === expected[index]);
  });
  if (!knownVersion) {
    throw new Error(`${OUTPUT_DIRECTORY} contains unexpected files; nothing was replaced.`);
  }
  for (const name of entries) {
    const entry = fs.lstatSync(path.join(destination, name));
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error(`${OUTPUT_DIRECTORY}/${name} is not a regular generated file; nothing was replaced.`);
    }
  }
}

function preparePublicSite(root = path.resolve(__dirname, "..")) {
  root = path.resolve(root);
  const destination = path.join(root, OUTPUT_DIRECTORY);
  // Read and validate everything before touching the previous publication.
  const contents = new Map(PUBLIC_FILES.map((name) => {
    const filename = path.join(root, name);
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${name} must be a regular source file, not a symlink.`);
    const bytes = fs.readFileSync(filename);
    if (!bytes.length) throw new Error(`${name} is empty; nothing was published.`);
    if (name.endsWith(".js")) new vm.Script(bytes.toString("utf8"), { filename: name });
    return [name, bytes];
  }));
  validateHtml(contents.get("index.html").toString("utf8"));
  validatePreviousOutput(destination);

  const staging = fs.mkdtempSync(path.join(root, ".public-site-stage-"));
  const next = path.join(staging, "next");
  const previous = path.join(staging, "previous");
  let movedPrevious = false;
  let installed = false;
  try {
    fs.mkdirSync(next);
    for (const [name, bytes] of contents) fs.writeFileSync(path.join(next, name), bytes, { flag: "wx" });
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
    console.log(`Prepared exactly ${PUBLIC_FILES.length} public files in ${preparePublicSite()}`);
  } catch (error) {
    console.error(`Public site preparation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
