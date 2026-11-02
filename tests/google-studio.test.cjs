"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const jpeg = (marker = 7) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, marker, 0xff, 0xd9]);
const image = (marker = 7, name = "trial.jpg") => ({ name, mimeType: "image/jpeg", base64: jpeg(marker).toString("base64") });
const payload = (marker = 7) => ({ image: image(marker), width: 1200, height: 800 });
const clone = value => JSON.parse(JSON.stringify(value));

function makeStudio({ activeEmail = "owner@example.test", effectiveEmail = "owner@example.test", projectOwnerEmail = "owner@example.test" } = {}) {
  const properties = new Map([
    ["PROJECT_OWNER_EMAIL", projectOwnerEmail], ["SITE_URL", "https://artist.example/exposures/"],
    ["EXPOSURE_ROOT_FOLDER_ID", "managed-root"],
    ["EXPOSURE_ARTIST_FOLDER_ID", "managed-artist"], ["EXPOSURE_ORIGINALS_FOLDER_ID", "managed-originals"],
    ["EXPOSURE_RESULTS_FOLDER_ID", "managed-results"], ["EXPOSURE_SPREADSHEET_ID", "visitor-index"]
  ]);
  const folders = new Map(), files = new Map();
  const io = { driveReads: 0, folderWrites: 0, fileWrites: 0, blobReads: 0, propertyReads: 0, propertyWrites: 0, indexCalls: 0, htmlReads: [] };
  const failures = { beforeCreate: false, afterCreate: false, read: false, busy: false };
  const lock = { held: false, acquired: 0, released: 0 };
  let sequence = 0;
  const iterator = values => { let i = 0; return { hasNext: () => i < values.length, next: () => values[i++] }; };

  class Blob {
    constructor(bytes, type, name) { this.bytes = Buffer.from(bytes); this.type = type; this.name = name; }
    getBytes() { return Array.from(this.bytes, value => value > 127 ? value - 256 : value); }
    getContentType() { return this.type; }
    getName() { return this.name; }
  }
  class File {
    constructor(folder, blob) { this.id = `personal-file-${++sequence}`; this.folder = folder; this.blob = new Blob(blob.bytes, blob.type, blob.name); files.set(this.id, this); folder.files.push(this); }
    getBlob() { io.blobReads++; if (failures.read) { failures.read = false; throw new Error("private-token https://private.example/secret"); } return this.blob; }
    getUrl() { return `https://drive.google.com/file/d/${this.id}/view`; }
  }
  class Folder {
    constructor(id, name, parent = null, managed = true) { Object.assign(this, { id, name, parent, managed, folders: [], files: [] }); folders.set(id, this); if (parent) parent.folders.push(this); }
    getId() { return this.id; }
    getUrl() { return `https://drive.google.com/drive/folders/${this.id}`; }
    getFoldersByName(name) { io.driveReads++; return iterator(this.folders.filter(folder => folder.managed && folder.name === name)); }
    getFilesByName(name) { io.driveReads++; return iterator(this.files.filter(file => file.blob.name === name)); }
    createFolder(name) { io.folderWrites++; return new Folder(`personal-folder-${++sequence}`, name, this); }
    createFile(blob) {
      if (failures.beforeCreate) { failures.beforeCreate = false; throw new Error("private-token https://private.example/secret"); }
      io.fileWrites++;
      const file = new File(this, blob);
      if (failures.afterCreate) { failures.afterCreate = false; throw new Error("private-token https://private.example/secret"); }
      return file;
    }
  }
  const archiveRoot = new Folder("managed-root", "Private archive");
  new Folder("managed-artist", "My_photos", archiveRoot);
  new Folder("managed-originals", "participant_uploads", archiveRoot);
  new Folder("managed-results", "Completed_double_exposures", archiveRoot);
  const indexAccess = () => { io.indexCalls++; throw new Error("The personal studio must not access the visitor index."); };
  class HtmlOutput {
    constructor(content) { this.content = content; this.metaTags = []; }
    getContent() { return this.content; }
    addMetaTag(name, content) { this.metaTags.push({ name, content }); return this; }
    setTitle(title) { this.title = title; return this; }
    setXFrameOptionsMode(mode) { this.frameMode = mode; return this; }
  }
  const sandbox = {
    console,
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: "ALLOWALL" },
      createHtmlOutput: content => new HtmlOutput(content),
      createHtmlOutputFromFile: name => {
        io.htmlReads.push(name);
        return new HtmlOutput(name === "Studio"
          ? '<link rel="stylesheet" href="__STUDIO_ASSET_ROOT__owner-studio.css"><script src="__STUDIO_ASSET_ROOT__owner-studio.js" defer></script><main>private studio controls</main>'
          : fs.readFileSync(path.join(root, "google-apps-script", `${name}.html`), "utf8"));
      }
    },
    ScriptApp: { getService: () => ({ getUrl: () => "https://script.google.com/macros/s/studio-test/exec" }) },
    Session: { getActiveUser: () => ({ getEmail: () => activeEmail }), getEffectiveUser: () => ({ getEmail: () => effectiveEmail }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => { io.propertyReads++; return properties.get(key) ?? null; },
      setProperty: (key, value) => { io.propertyWrites++; properties.set(key, value); }
    }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" },
      base64Decode: value => Array.from(Buffer.from(value, "base64")),
      computeDigest: (_, bytes) => Array.from(crypto.createHash("sha256").update(Buffer.from(bytes)).digest()),
      newBlob: (bytes, type, name) => new Blob(bytes, type, name)
    },
    LockService: { getScriptLock: () => ({
      tryLock: () => { if (failures.busy || lock.held) return false; lock.held = true; lock.acquired++; return true; },
      releaseLock: () => { lock.held = false; lock.released++; }
    }) },
    ArchiveDrive: {
      reset() {},
      getFolderById(id) { io.driveReads++; const folder = folders.get(id); if (!folder?.managed) { const error = new Error("The folder is not managed by this project."); error.exposureCode_ = "ACCESS_NOT_GRANTED"; throw error; } return folder; },
      getFileById: indexAccess, getArtistFolderById: indexAccess, getArtistFileById: indexAccess
    },
    ArchiveSheets: { reset() {}, flush() {}, openById: indexAccess, create: indexAccess }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "google-apps-script", "Code.gs"), "utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "google-apps-script", "OwnerStudio.gs"), "utf8"), sandbox);
  return {
    api: (action, body) => clone(sandbox.studioApi({ action, ...(body === undefined ? {} : { payload: body }) })),
    request: request => clone(sandbox.studioApi(request)), sandbox, properties, folders, files, io, failures, lock,
    folder: () => folders.get(properties.get("EXPOSURE_OWNER_RESULTS_FOLDER_ID")),
    seedFolder: (id, name, parent = archiveRoot, managed = true) => new Folder(id, name, parent, managed)
  };
}

test("only the configured project owner can request studio status or save a result", () => {
  for (const identity of [
    { activeEmail: "" }, { activeEmail: "visitor@example.test" }, { effectiveEmail: "" },
    { activeEmail: "", effectiveEmail: "" },
    { activeEmail: "other@example.test", effectiveEmail: "other@example.test" }
  ]) {
    const studio = makeStudio(identity);
    for (const action of ["status", "save"]) {
      const response = studio.api(action, action === "save" ? payload() : {});
      assert.equal(response.ok, false);
      assert.ok(["OWNER_REQUIRED", "OWNER_ACCOUNT_MISMATCH"].includes(response.error.code));
    }
    assert.equal(studio.request({ action: "save", email: "owner@example.test", payload: payload() }).ok, false);
    assert.ok(["OWNER_REQUIRED", "OWNER_ACCOUNT_MISMATCH"].includes(studio.request({ action: "unknown", payload: null }).error.code),
      "identity is checked before even an invalid request is inspected");
    assert.equal(studio.io.driveReads, 0);
    assert.equal(studio.io.folderWrites, 0);
    assert.equal(studio.io.fileWrites, 0);
    assert.equal(studio.io.propertyWrites, 0);
    assert.equal(studio.lock.acquired, 0);
    assert.equal(studio.io.indexCalls, 0);
  }
});

test("the owner-only studio route loads its template with configured external assets and default framing", () => {
  const studio = makeStudio();
  const page = studio.sandbox.doGet({ parameter: { view: "studio" } });
  assert.equal(page.title, "Double exposure · local test");
  assert.deepEqual(page.metaTags, [{ name: "viewport", content: "width=device-width, initial-scale=1" }]);
  assert.equal(page.frameMode, undefined);
  assert.match(page.getContent(), /https:\/\/artist\.example\/exposures\/owner-studio\.css/);
  assert.match(page.getContent(), /https:\/\/artist\.example\/exposures\/owner-studio\.js/);
  assert.match(page.getContent(), /private studio controls/);
  assert.doesNotMatch(page.getContent(), /__STUDIO_ASSET_ROOT__|getOAuthToken|access_token|refresh_token|\sstyle=|\sonclick=/i);
  assert.deepEqual(studio.io.htmlReads, ["Studio"]);
  assert.equal(studio.io.driveReads, 0);
  assert.equal(studio.io.folderWrites, 0);
  assert.equal(studio.io.fileWrites, 0);
  assert.equal(studio.io.propertyWrites, 0);
});

test("studio route authentication happens before template loading for anonymous and other accounts", () => {
  for (const identity of [
    { activeEmail: "" }, { activeEmail: "visitor@example.test" }, { effectiveEmail: "" },
    { activeEmail: "other@example.test", effectiveEmail: "other@example.test" }
  ]) {
    const studio = makeStudio(identity);
    const page = studio.sandbox.doGet({ parameter: { view: "studio", email: "owner@example.test" } });
    assert.doesNotMatch(page.getContent(), /private studio controls|owner-studio\.(?:js|css)|<script\b/);
    assert.deepEqual(studio.io.htmlReads, []);
    assert.equal(studio.io.driveReads, 0);
    assert.equal(studio.io.folderWrites, 0);
    assert.equal(studio.io.fileWrites, 0);
    assert.equal(studio.io.propertyWrites, 0);
    if (identity.activeEmail !== identity.effectiveEmail) {
      assert.equal(page.getContent(), "Open this page while signed into the project Google account.");
    }
  }
});

test("studio asset-root replacement escapes every marker without accepting a caller-selected asset root", () => {
  const studio = makeStudio();
  studio.properties.set("SITE_URL", "https://artist.example/exposures/'&/");
  const page = studio.sandbox.doGet({ parameter: { view: "studio", siteUrl: "https://attacker.example/" } });
  assert.equal((page.getContent().match(/https:\/\/artist\.example\/exposures\/&#39;&amp;\//g) || []).length, 2);
  assert.doesNotMatch(page.getContent(), /attacker\.example|__STUDIO_ASSET_ROOT__/);
});

test("adding the studio preserves existing artist and visitor denial messages and bridge framing", () => {
  const studio = makeStudio({ activeEmail: "" });
  assert.equal(studio.sandbox.doGet({ parameter: { view: "artist" } }).getContent(),
    "Open the artist import page while signed into the account that deployed this project.");
  assert.equal(studio.sandbox.doGet({ parameter: { view: "unknown" } }).getContent(),
    "The exposure archive connection is unavailable.");
  assert.equal(studio.sandbox.doGet({ parameter: { view: "studio", asset: "Studio" } }).getContent(),
    "The exposure archive connection is unavailable.");
  const bridge = studio.sandbox.doGet({ parameter: { origin: "https://artist.example", channel: "a".repeat(32) } });
  assert.equal(bridge.title, "Exposure archive connection");
  assert.equal(bridge.frameMode, "ALLOWALL");
  assert.deepEqual(studio.io.htmlReads, ["Bridge"]);
  assert.equal(studio.io.driveReads, 0);
  assert.equal(studio.io.fileWrites, 0);
});

test("the anonymous visitor API cannot invoke personal archive operations", () => {
  const studio = makeStudio();
  for (const action of ["studioApi", "status", "save"]) {
    const response = clone(studio.sandbox.exposureApi({ action, payload: payload() }));
    assert.equal(response.ok, false);
    assert.equal(response.error.code, "INVALID_REQUEST");
  }
  assert.equal(studio.io.driveReads, 0);
  assert.equal(studio.io.fileWrites, 0);
  assert.equal(studio.io.folderWrites, 0);
  assert.equal(studio.io.indexCalls, 0);
});

test("studio status creates and reuses a separate managed folder under the existing root", () => {
  const studio = makeStudio();
  const before = new Map(studio.properties);
  const first = studio.api("status");
  assert.equal(first.ok, true);
  assert.equal(first.data.maxResultBytes, 12 * 1024 * 1024);
  assert.equal(first.data.folderUrl, studio.folder().getUrl());
  assert.equal(studio.folder().name, "Personal_double_exposures");
  assert.equal(studio.folder().parent.id, "managed-root");
  assert.deepEqual(studio.api("status"), first);
  assert.equal(studio.io.folderWrites, 1);
  assert.equal(studio.io.propertyWrites, 1);
  for (const [key, value] of before) assert.equal(studio.properties.get(key), value);
  assert.equal(studio.io.fileWrites, 0);
  assert.equal(studio.io.indexCalls, 0);
});

test("an interrupted folder-property write can recover only an existing managed child folder", () => {
  const studio = makeStudio();
  studio.seedFolder("unmanaged-same-name", "Personal_double_exposures", undefined, false);
  const managed = studio.seedFolder("managed-personal", "Personal_double_exposures");
  const response = studio.api("status");
  assert.equal(response.ok, true);
  assert.equal(response.data.folderUrl, managed.getUrl());
  assert.equal(studio.properties.get("EXPOSURE_OWNER_RESULTS_FOLDER_ID"), managed.id);
  assert.equal(studio.io.folderWrites, 0);
});

test("personal results cannot be directed into any visitor or artist folder through configuration", () => {
  for (const id of ["managed-root", "managed-artist", "managed-originals", "managed-results", "unmanaged-folder"]) {
    const studio = makeStudio();
    studio.properties.set("EXPOSURE_OWNER_RESULTS_FOLDER_ID", id);
    const response = studio.api("save", payload());
    assert.equal(response.ok, false);
    assert.ok(["STUDIO_CONFIGURATION", "ACCESS_NOT_GRANTED"].includes(response.error.code));
    assert.equal(studio.io.fileWrites, 0);
    assert.equal(studio.io.folderWrites, 0);
    assert.equal(studio.io.indexCalls, 0);
  }
});

test("owner saves preserve the exact JPEG and return a verified folder-local receipt", () => {
  const studio = makeStudio();
  const result = studio.api("save", payload(23));
  const hash = crypto.createHash("sha256").update(jpeg(23)).digest("hex");
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    saved: true, duplicate: false, sha256: hash, byteLength: jpeg(23).length, width: 1200, height: 800,
    fileUrl: [...studio.files.values()][0].getUrl(), folderUrl: studio.folder().getUrl()
  });
  assert.equal(studio.folder().files[0].blob.name, `personal-result-${hash}.jpg`);
  assert.deepEqual(studio.folder().files[0].blob.bytes, jpeg(23));
  assert.equal(studio.folder().files[0].blob.type, "image/jpeg");
  for (const id of ["managed-artist", "managed-originals", "managed-results"]) assert.equal(studio.folders.get(id).files.length, 0);
  assert.equal(studio.io.indexCalls, 0);
  assert.equal(studio.io.fileWrites, 1);
  assert.equal(studio.io.blobReads, 1, "new writes are verified before returning saved:true");
  assert.equal(studio.lock.held, false);
  assert.equal(studio.lock.released, 1);
});

test("repeated and renamed results reuse the same verified personal file", () => {
  const studio = makeStudio();
  const first = studio.api("save", payload());
  const renamed = { ...payload(), image: image(7, "renamed.jpg") };
  const second = studio.api("save", renamed);
  assert.equal(second.ok, true);
  assert.equal(second.data.duplicate, true);
  assert.equal(second.data.fileUrl, first.data.fileUrl);
  assert.equal(second.data.sha256, first.data.sha256);
  assert.equal(studio.io.fileWrites, 1);
  assert.equal(studio.files.size, 1);
  assert.equal(studio.io.indexCalls, 0);
});

test("a lost response after a Drive write recovers the existing JPEG without another copy", () => {
  const studio = makeStudio();
  studio.failures.afterCreate = true;
  const failed = studio.api("save", payload());
  assert.equal(failed.ok, false);
  assert.equal(failed.error.code, "ARCHIVE_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(failed), /private-token|private\.example|base64|stack/);
  assert.equal(studio.files.size, 1);
  const resumed = studio.api("save", payload());
  assert.equal(resumed.ok, true);
  assert.equal(resumed.data.duplicate, true);
  assert.equal(studio.io.fileWrites, 1);
  assert.equal(studio.files.size, 1);
  assert.equal(studio.lock.acquired, studio.lock.released);
});

test("unconfirmed new-file verification never returns success and its retry reuses that file", () => {
  const studio = makeStudio();
  studio.failures.read = true;
  const failed = studio.api("save", payload());
  assert.equal(failed.ok, false);
  assert.equal(failed.error.code, "ARCHIVE_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(failed), /private-token|private\.example/);
  const resumed = studio.api("save", payload());
  assert.equal(resumed.ok, true);
  assert.equal(resumed.data.duplicate, true);
  assert.equal(studio.io.fileWrites, 1);
});

test("a conflicting same-name file fails closed without replacing it or creating a duplicate", () => {
  const studio = makeStudio();
  assert.equal(studio.api("save", payload()).ok, true);
  studio.folder().files[0].blob.bytes = jpeg(99);
  const response = studio.api("save", payload());
  assert.equal(response.ok, false);
  assert.equal(response.error.code, "STORAGE_CONFLICT");
  assert.equal(studio.io.fileWrites, 1);
  assert.deepEqual(studio.folder().files[0].blob.bytes, jpeg(99));
  assert.equal(studio.lock.held, false);
});

test("studio save rejects invalid JPEGs, oversized data and dimensions before any Drive access", () => {
  const cases = [
    { ...payload(), image: { ...image(), mimeType: "image/png" } },
    { ...payload(), image: { name: "code.svg", mimeType: "image/svg+xml", base64: Buffer.from("<svg/>").toString("base64") } },
    { ...payload(), image: { ...image(), base64: "not base64!" } },
    { ...payload(), image: { ...image(), base64: "" } },
    { ...payload(), image: { ...image(), base64: "A".repeat(Math.ceil(12 * 1024 * 1024 / 3) * 4 + 4) } },
    { ...payload(), width: 0 }, { ...payload(), height: 10001 },
    { ...payload(), width: 10000, height: 10000 }, { ...payload(), width: 1.5 }
  ];
  for (const body of cases) {
    const studio = makeStudio();
    const response = studio.api("save", body);
    assert.equal(response.ok, false);
    assert.ok(["INVALID_IMAGE", "UNSUPPORTED_IMAGE", "INVALID_DIMENSIONS"].includes(response.error.code));
    assert.equal(studio.io.driveReads, 0);
    assert.equal(studio.io.folderWrites, 0);
    assert.equal(studio.io.fileWrites, 0);
    assert.equal(studio.io.propertyWrites, 0);
    assert.equal(studio.io.indexCalls, 0);
  }
});

test("studio requests accept no caller-selected IDs, URLs, paths or recipe sidecars", () => {
  const cases = [
    null, [], {}, { action: "import", payload: payload() }, { action: "save", fileId: "private-file", payload: payload() },
    { action: "status", payload: { folderId: "managed-results" } },
    ...["folderId", "fileId", "url", "path", "settings"].map(key => ({ action: "save", payload: { ...payload(), [key]: "untrusted" } })),
    { action: "save", payload: { ...payload(), image: { ...image(), fileId: "unrelated-file" } } },
    { action: "save", payload: { ...payload(), image: image(7, "../participant_uploads/result.jpg") } },
    { action: "save", payload: [] }
  ];
  for (const request of cases) {
    const studio = makeStudio();
    assert.equal(studio.request(request).error.code, "INVALID_REQUEST");
    assert.equal(studio.io.driveReads, 0);
    assert.equal(studio.io.folderWrites, 0);
    assert.equal(studio.io.fileWrites, 0);
    assert.equal(studio.io.indexCalls, 0);
  }
});

test("missing setup and lock contention do not create a new root or any files", () => {
  const missing = makeStudio();
  missing.properties.delete("EXPOSURE_ROOT_FOLDER_ID");
  assert.equal(missing.api("save", payload()).error.code, "NOT_CONFIGURED");
  assert.equal(missing.io.folderWrites, 0);
  assert.equal(missing.io.fileWrites, 0);
  assert.equal(missing.lock.held, false);
  const busy = makeStudio();
  busy.failures.busy = true;
  assert.equal(busy.api("save", payload()).error.code, "BUSY");
  assert.equal(busy.io.driveReads, 0);
  assert.equal(busy.io.folderWrites, 0);
  assert.equal(busy.io.fileWrites, 0);
});
