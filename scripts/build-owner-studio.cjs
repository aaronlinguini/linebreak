"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { PUBLIC_FILES, addContentVersions, validateHtml, validateJavaScript, readRegularFile } = require("./prepare-public-site.cjs");

const SOURCE_PAGE = "local-test.html";
const DESTINATION = "google-apps-script/Studio.html";
const ASSET_ROOT = "__STUDIO_ASSET_ROOT__";
const PRIVATE_NOTE = "Finished versions are saved automatically to your private folder. The photographs you choose stay on your device.";

function ownerStudioSource(source, assets) {
  if ((source.match(/<body\b/gi) || []).length !== 1 || /\bdata-owner-studio\b/i.test(source)) {
    throw new Error("local-test.html needs one unmarked body for the owner studio.");
  }
  const localScript = /<script\b[^>]*\bsrc=["'](?:\.\/)?local-test\.js(?:\?[^"']*)?["'][^>]*>\s*<\/script>/gi;
  if ((source.match(localScript) || []).length !== 1 || /\bsrc=["'](?:\.\/)?owner-studio\.js/i.test(source)) {
    throw new Error("local-test.html needs one local-test.js script and no owner-studio.js script.");
  }
  const note = /(<p\b[^>]*\bid=["']test-note["'][^>]*>)[\s\S]*?(<\/p>)/gi;
  if ((source.match(note) || []).length !== 1) throw new Error("local-test.html needs one test-note paragraph.");
  const html = source
    .replace(/<body\b/i, '<body data-owner-studio="true"')
    .replace(localScript, '$&\n    <script src="owner-studio.js" defer></script>')
    .replace(note, (_, open, close) => open + PRIVATE_NOTE + close);
  validateHtml(html, SOURCE_PAGE, new Set(assets.keys()));
  const versioned = addContentVersions(new Map([...assets, [SOURCE_PAGE, Buffer.from(html)]]));
  return versioned.get(SOURCE_PAGE).toString("utf8").replace(
    /<!--[\s\S]*?-->|(\b(?:src|href)\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (match, attribute, double, single, unquoted) => {
      if (!attribute) return match;
      const reference = double ?? single ?? unquoted;
      if (!/\.(?:css|js)(?:[?#]|$)/.test(reference)) return match;
      const quote = single !== undefined ? "'" : '"';
      const address = reference.replace(/&amp;/g, "&");
      const separator = address.search(/[?#]/);
      const pathname = separator < 0 ? address : address.slice(0, separator);
      const suffix = separator < 0 ? "" : address.slice(separator);
      const filename = path.posix.normalize(decodeURIComponent(pathname));
      if (!assets.has(filename)) throw new Error(`The owner studio references an unpublished asset: ${reference}`);
      const encoded = filename.split("/").map(encodeURIComponent).join("/");
      return `${attribute}${quote}${ASSET_ROOT}${encoded}${suffix.replace(/&/g, "&amp;")}${quote}`;
    }
  );
}

function buildOwnerStudio({ check = false, root = path.resolve(__dirname, "..") } = {}) {
  const assets = new Map(PUBLIC_FILES.filter(name => /\.(?:css|js)$/.test(name)).map(name => {
    const bytes = readRegularFile(root, name);
    if (!bytes.length) throw new Error(`${name} is empty; the owner studio was not changed.`);
    if (name.endsWith(".js")) validateJavaScript(bytes, name);
    return [name, bytes];
  }));
  const source = ownerStudioSource(readRegularFile(root, SOURCE_PAGE).toString("utf8"), assets);
  const destination = path.join(root, DESTINATION);
  if (check) {
    if (!fs.existsSync(destination) || readRegularFile(root, DESTINATION).toString("utf8") !== source) {
      throw new Error("Studio.html differs from the local test or published assets; run node scripts/build-owner-studio.cjs.");
    }
  } else {
    if (fs.existsSync(destination)) readRegularFile(root, DESTINATION);
    fs.writeFileSync(destination, source);
  }
  return destination;
}

module.exports = { ASSET_ROOT, PRIVATE_NOTE, ownerStudioSource, buildOwnerStudio };

if (require.main === module) {
  try {
    const arguments_ = process.argv.slice(2);
    if (arguments_.length > 1 || (arguments_.length && arguments_[0] !== "--check")) {
      throw new Error("Usage: node scripts/build-owner-studio.cjs [--check]");
    }
    buildOwnerStudio({ check: arguments_[0] === "--check" });
    console.log(arguments_[0] === "--check" ? "Google owner studio matches the local test and published assets."
      : "Built google-apps-script/Studio.html.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
