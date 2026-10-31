"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const project = path.resolve(__dirname, "..");
const clone = (value) => JSON.parse(JSON.stringify(value));
const signed = (bytes) => Array.from(bytes, (value) => value > 127 ? value - 256 : value);
const jpeg = (marker) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, marker, 0xff, 0xd9]);
const original = (marker, name = `photo-${marker}.jpg`) => ({ name, mimeType: "image/jpeg", base64: jpeg(marker).toString("base64") });
const submissionId = (number) => `11111111-1111-4111-8111-${String(number).padStart(12, "0")}`;
function assetFor(backend, sourceId, name = "base.jpg") {
  const source = backend.records("Sources").find(source => source.sourceId === sourceId);
  return { path: `assets/base-photos/${name}`, sha256: source.sha256, mimeType: source.mimeType,
    byteLength: Number(source.byteLength), name };
}

// In-memory fakes implement the Google service boundary. The application's
// real Apps Script is executed unchanged, so persistence and retry assertions
// exercise its actual public API rather than a second implementation of it.
function makeBackend({ activeEmail = "owner@example.test", effectiveEmail = "owner@example.test", projectOwnerEmail = "owner@example.test", deploymentUrl = "https://script.google.com/macros/s/deployment-example/exec" } = {}) {
  let nextId = 0;
  let timestamp = Date.parse("2026-10-29T12:00:00Z");
  const files = new Map();
  const folders = new Map();
  const books = new Map();
  const properties = new Map([["SITE_URL", "https://artist.example/exposures/"], ["PROJECT_OWNER_EMAIL", projectOwnerEmail]]);
  const io = { driveCalls: 0, blobReads: 0, fingerprintReads: 0, listings: 0, propertyReads: 0, sheetWrites: Object.create(null) };
  const logs = [];
  const failures = { sheetWrite: null, fileCreate: false, participantMark: false, fileMove: false };
  const iterator = (values) => { let index = 0; return { hasNext: () => index < values.length, next: () => values[index++] }; };
  const id = (kind) => `${kind}-${++nextId}`;

  class Blob {
    constructor(bytes, type = "application/octet-stream", name = "") {
      this.bytes = Buffer.isBuffer(bytes) ? Buffer.from(bytes) : Buffer.from(bytes || []);
      this.type = type;
      this.name = name;
    }
    getBytes() { return signed(this.bytes); }
    getContentType() { return this.type; }
    setContentType(type) { this.type = type; return this; }
    getName() { return this.name; }
    setName(name) { this.name = name; return this; }
    copyBlob() { return new Blob(this.bytes, this.type, this.name); }
    getDataAsString() { return this.bytes.toString("utf8"); }
  }
  class File {
    constructor(blob, folder) {
      this.id = id("file"); this.blob = blob.copyBlob(); this.folder = folder;
      this.trashed = false; this.participant = false; this.date = new Date("2026-10-25T00:00:00Z");
      files.set(this.id, this);
      if (folder) folder.files.push(this);
    }
    getId() { return this.id; }
    getName() { return this.blob.name; }
    setName(value) { this.blob.name = value; return this; }
    isParticipantPhoto() { return this.participant; }
    markParticipantPhoto(value) {
      if (failures.participantMark) { failures.participantMark = false; throw new Error("Simulated participant marker failure"); }
      this.participant = true; this.blob.name = value; return this;
    }
    getBlob() { io.blobReads++; return this.blob.copyBlob(); }
    getMimeType() { return this.blob.type; }
    getSize() { return this.blob.bytes.length; }
    getUrl() { return `https://drive.google.com/file/d/${this.id}/view`; }
    getDateCreated() { return this.date; }
    getLastUpdated() { return this.date; }
    getSha256Checksum() { return this.driveChecksum === true ? crypto.createHash("sha256").update(this.blob.bytes).digest("hex") : this.driveChecksum || ""; }
    getScanFingerprint() {
      io.fingerprintReads++;
      if (this.onFingerprint) this.onFingerprint();
      return { sha256: this.getSha256Checksum(), header: signed(this.blob.bytes.subarray(0, 64)),
        fullRead: this.rangeIgnored === true, transferredBytes: this.rangeIgnored ? this.getSize() : Math.min(64, this.getSize()) };
    }
    isTrashed() { return this.trashed; }
    setTrashed(value) { this.trashed = value; return this; }
    getParents() { return iterator(this.folder ? [this.folder] : []); }
    moveTo(folder) {
      if (failures.fileMove) { failures.fileMove = false; throw new Error("Simulated Drive move failure"); }
      if (this.folder) this.folder.files = this.folder.files.filter((file) => file !== this);
      this.folder = folder; folder.files.push(this); return this;
    }
  }
  class Folder {
    constructor(name, parent) { this.id = id("folder"); this.name = name; this.files = []; this.folders = []; folders.set(this.id, this); if (parent) parent.folders.push(this); }
    getId() { return this.id; }
    getName() { return this.name; }
    getUrl() { return `https://drive.google.com/drive/folders/${this.id}`; }
    createFolder(name) { return new Folder(name, this); }
    createFile(blob) {
      if (failures.fileCreate) { failures.fileCreate = false; throw new Error("Simulated Drive write failure"); }
      return new File(blob, this);
    }
    getFiles() { io.listings++; return iterator(this.files.filter((file) => !file.trashed)); }
    getFilesByName(name) { return iterator(this.files.filter((file) => !file.trashed && file.getName() === name)); }
    getFoldersByName(name) { return iterator(this.folders.filter((folder) => folder.name === name)); }
    addFile(file) { file.moveTo(this); return this; }
  }
  class Range {
    constructor(sheet, row, column, rows = 1, columns = 1) { Object.assign(this, { sheet, row, column, rows, columns }); }
    getValues() {
      return Array.from({ length: this.rows }, (_, y) => Array.from({ length: this.columns }, (_, x) => this.sheet.rows[this.row + y - 1]?.[this.column + x - 1] ?? ""));
    }
    getValue() { return this.getValues()[0][0]; }
    setValues(values) {
      io.sheetWrites[this.sheet.name] = (io.sheetWrites[this.sheet.name] || 0) + 1;
      if (failures.sheetWrite?.(this.sheet, values)) { failures.sheetWrite = null; throw new Error("Simulated temporary Sheet write failure"); }
      values.forEach((row, y) => row.forEach((value, x) => {
        this.sheet.rows[this.row + y - 1] ??= [];
        this.sheet.rows[this.row + y - 1][this.column + x - 1] = value;
      }));
      return this;
    }
    setValue(value) { return this.setValues([[value]]); }
    setNumberFormat() { return this; }
    setFontWeight() { return this; }
    clearContent() { return this.setValues(Array.from({ length: this.rows }, () => Array(this.columns).fill(""))); }
  }
  class Sheet {
    constructor(name) { this.name = name; this.rows = []; }
    getName() { return this.name; }
    setName(name) { this.name = name; return this; }
    getLastRow() { return this.rows.length; }
    getLastColumn() { return Math.max(0, ...this.rows.map((row) => row.length)); }
    getDataRange() { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
    getRange(row, column, rows, columns) { return new Range(this, row, column, rows, columns); }
    appendRow(row) { return this.getRange(this.rows.length + 1, 1, 1, row.length).setValues([row]); }
    setFrozenRows() { return this; }
    autoResizeColumns() { return this; }
    clear() { this.rows = []; return this; }
  }
  class Book {
    constructor(name) {
      this.id = id("book"); this.name = name; this.sheets = [new Sheet("Sheet1")]; books.set(this.id, this);
      const file = new File(new Blob([], "application/vnd.google-apps.spreadsheet", name));
      files.delete(file.id); file.id = this.id; files.set(this.id, file);
    }
    getId() { return this.id; }
    getUrl() { return `https://docs.google.com/spreadsheets/d/${this.id}/edit`; }
    getSheets() { return this.sheets; }
    getSheetByName(name) { return this.sheets.find((sheet) => sheet.name === name) || null; }
    insertSheet(name) { const sheet = new Sheet(name); this.sheets.push(sheet); return sheet; }
    deleteSheet(sheet) { this.sheets = this.sheets.filter((item) => item !== sheet); }
  }
  const lock = { held: false, count: 0, waitLock() { assert.equal(this.held, false, "nested script lock"); this.held = true; this.count++; }, tryLock() { this.waitLock(); return true; }, releaseLock() { this.held = false; }, hasLock() { return this.held; } };
  const htmlOutput = (content) => ({ getContent: () => content, setTitle() { return this; }, setXFrameOptionsMode(mode) { this.frameMode = mode; return this; } });
  const sandbox = vm.createContext({
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [timestamp])); }
      static now() { return timestamp; }
    },
    console: { log: (...values) => logs.push(values.join(" ")) },
    Logger: { log: (...values) => logs.push(values.join(" ")) },
    ArchiveDrive: {
      reset() {},
      createFolder: (name) => { io.driveCalls++; return new Folder(name); },
      getFoldersByName: (name) => iterator(Array.from(folders.values()).filter((folder) => folder.name === name)),
      getFolderById: (key) => { io.driveCalls++; if (!folders.has(key)) throw new Error(`No folder ${key}`); return folders.get(key); },
      getFileById: (key) => { io.driveCalls++; if (!files.has(key)) throw new Error(`No file ${key}`); return files.get(key); },
      getArtistFolderById: (key) => { io.driveCalls++; if (!folders.has(key)) throw new Error(`No artist folder ${key}`); return folders.get(key); },
      getArtistFileById: (key, folderId) => {
        io.driveCalls++;
        const file = files.get(key);
        if (!file || file.trashed || file.folder?.getId() !== folderId) throw new Error(`Artist file unavailable ${key}`);
        return file;
      }
    },
    ArchiveSheets: { reset() {}, create: (name) => new Book(name), openById: (key) => { if (!books.has(key)) throw new Error(`No book ${key}`); return books.get(key); }, flush() {} },
    LockService: { getScriptLock: () => lock },
    Session: {
      getActiveUser: () => ({ getEmail: () => activeEmail }),
      getEffectiveUser: () => ({ getEmail: () => effectiveEmail })
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key) => { io.propertyReads++; return properties.get(key) ?? null; },
      setProperty(key, value) { properties.set(key, String(value)); return this; },
      getProperties: () => Object.fromEntries(properties),
      setProperties(values, removeOthers) { if (removeOthers) properties.clear(); for (const [key, value] of Object.entries(values)) properties.set(key, String(value)); return this; },
      deleteProperty: (key) => properties.delete(key)
    }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
      newBlob: (bytes, type, name) => new Blob(bytes, type, name),
      base64Encode: (bytes) => Buffer.from(bytes).toString("base64"),
      base64Decode: (value) => signed(Buffer.from(value, "base64")),
      computeDigest: (algorithm, bytes) => signed(crypto.createHash("sha256").update(Buffer.from(bytes)).digest()),
      getUuid: () => crypto.randomUUID(),
      formatDate: (date) => date.toISOString(),
      sleep() {}
    },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: "ALLOWALL" },
      createHtmlOutput: htmlOutput,
      createHtmlOutputFromFile: (name) => htmlOutput(fs.readFileSync(path.join(project, "google-apps-script", `${name}.html`), "utf8"))
    },
    ContentService: {
      MimeType: { JAVASCRIPT: "JAVASCRIPT" },
      createTextOutput: (content) => ({ getContent: () => content, setMimeType(type) { this.mimeType = type; return this; } })
    },
    ScriptApp: { getService: () => ({ getUrl: () => deploymentUrl }) }
  });
  const source = ["Code.gs", "Client.gs"].map((name) => fs.readFileSync(path.join(project, "google-apps-script", name), "utf8")).join("\n");
  vm.runInContext(source, sandbox, { timeout: 1000 });
  const api = (action, payload = {}) => clone(sandbox.exposureApi({ action, payload }));
  const data = (action, payload) => { const response = api(action, payload); assert.equal(response.ok, true, JSON.stringify(response)); return response.data; };
  const folder = (fragment) => {
    fragment = ({Artist: "My_photos", Participant: "participant_uploads", "Double exposure": "Completed_double_exposures"})[fragment] || fragment;
    const matches = Array.from(folders.values()).filter((entry) => entry.name.toLowerCase().includes(fragment.toLowerCase()));
    return matches.find((entry) => /^\d+ /.test(entry.name)) || matches[0];
  };
  const seed = (marker = 1, name = `artist-${marker}.jpg`, mimeType = "image/jpeg", bytes = jpeg(marker)) => folder("Artist").createFile(new Blob(bytes, mimeType, name));
  const begin = (number, marker = number + 10, allowReuse = false) =>
    data("begin", { submissionId: submissionId(number), original: original(marker), allowReuse });
  const completePayload = (begun, marker = 90) => ({ submissionId: begun.submissionId, token: begun.token, result: original(marker, `${begun.submissionId}.jpg`), width: 640, height: 480, settings: { baseExposure: -1, participantExposure: -1, contrast: 0, monochrome: false } });
  const setup = () => sandbox.setupProject();
  const refresh = () => sandbox.refreshArtistCollection();
  const advance = (milliseconds) => { timestamp += milliseconds; };
  const usage = () => clone([...books.values()][0].getSheetByName("Usage").rows.slice(1));
  const records = (name) => {
    const rows = [...books.values()][0].getSheetByName(name).rows;
    return clone(rows.slice(1).map((values) => Object.fromEntries(rows[0].map((header, index) => [header, values[index] ?? ""]))));
  };
  return { sandbox, properties, files, folders, books, logs, failures, lock, source, api, data, folder, seed, begin, completePayload, setup, refresh, advance, usage, records, Blob, io };
}

test("owner setup is repeatable and creates distinct private storage roles", () => {
  const backend = makeBackend();
  backend.setup();
  const counts = [backend.folders.size, backend.books.size, backend.files.size];
  backend.setup();
  assert.deepEqual([backend.folders.size, backend.books.size, backend.files.size], counts);
  assert.ok(backend.folder("Artist"));
  assert.ok(backend.folder("Participant"));
  assert.ok(backend.folder("Double exposure"));
  assert.equal(backend.books.size, 1);
  assert.equal(backend.lock.held, false);
});

test("an existing archive index gains consent columns without changing older records", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.refresh();
  const old = backend.begin(1, 22);
  const sheet = [...backend.books.values()][0].getSheetByName("Submissions");
  sheet.rows = sheet.rows.map((row) => row.slice(0, 13));
  const before = sheet.rows[1].slice();
  assert.equal(backend.data("bootstrap").totalEligible, 1);
  assert.deepEqual(sheet.rows[0].slice(13), ["allowReuse", "parentSubmissionId", "baseSha256"]);
  assert.deepEqual(sheet.rows[1].slice(0, 13), before);
  assert.equal(backend.data("begin", { submissionId: old.submissionId, original: original(22) }).originalId, old.originalId);
});

test("an original is saved byte-for-byte before the finished exposure exists", () => {
  const backend = makeBackend(); backend.setup(); const artist = backend.seed(); backend.refresh();
  const begun = backend.begin(1, 22);
  assert.deepEqual(backend.files.get(begun.originalId).blob.bytes, jpeg(22));
  assert.equal(begun.base.id, artist.getId());
  assert.equal(Buffer.from(begun.base.base64, "base64").equals(jpeg(1)), true);
  assert.equal(backend.folder("Double exposure").files.length, 0);
  assert.equal(backend.data("bootstrap").totalEligible, 1, "uncompleted original must stay out of the base pool");
});

test("completion archives the result, records both sources, and only then enables the original", () => {
  const backend = makeBackend(); backend.setup(); const artist = backend.seed(); backend.refresh();
  const begun = backend.begin(1, 22, true);
  const saved = backend.data("complete", backend.completePayload(begun));
  assert.equal(saved.saved, true);
  assert.equal(saved.originalId, begun.originalId);
  assert.equal(saved.baseId, artist.getId());
  assert.deepEqual(backend.files.get(saved.resultId).blob.bytes, jpeg(90));
  assert.equal(backend.files.get(saved.resultId).folder, backend.folder("Double exposure"));
  assert.equal(backend.data("bootstrap").totalEligible, 2, "the result must never become another base");
  const submissionRow = [...backend.books.values()][0].getSheets().flatMap((sheet) => sheet.rows).find((row) => row.includes(begun.submissionId));
  for (const value of [begun.originalId, artist.getId(), saved.resultId]) assert.ok(submissionRow.includes(value));
  assert.equal(backend.lock.held, false);
});

test("a completed original is archived privately by default while an explicit opt-in joins the pool", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.refresh();
  const privateBegin = backend.begin(1, 22);
  const privateResult = backend.data("complete", backend.completePayload(privateBegin, 90));
  assert.equal(privateResult.saved, true);
  assert.equal(backend.data("bootstrap").totalEligible, 1);
  assert.equal(backend.folder("Participant").files.length, 1);
  assert.equal(backend.folder("Double exposure").files.length, 1);
  const publicBegin = backend.begin(2, 23, true);
  backend.data("complete", backend.completePayload(publicBegin, 91));
  assert.equal(backend.data("bootstrap").totalEligible, 2);
  assert.equal(backend.api("begin", { submissionId: submissionId(2), original: original(23), allowReuse: false }).error.code, "SUBMISSION_CONFLICT");
});

test("another pairing reuses an authenticated original, chooses a different base, and archives a second result", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.seed(2); backend.refresh();
  const first = backend.begin(1, 22, true);
  const firstReceipt = backend.data("complete", backend.completePayload(first, 90));
  assert.equal(firstReceipt.canRePair, true);
  const rePairPayload = { submissionId: submissionId(2), reuse: { submissionId: first.submissionId, token: first.token } };
  const second = backend.data("begin", rePairPayload);
  assert.equal(second.originalId, first.originalId);
  assert.notEqual(second.base.id, first.base.id);
  assert.deepEqual(backend.data("begin", rePairPayload), second, "a retry retains the selected base and token");
  const secondReceipt = backend.data("complete", backend.completePayload(second, 91));
  assert.equal(secondReceipt.saved, true);
  assert.equal(secondReceipt.originalId, firstReceipt.originalId);
  assert.notEqual(secondReceipt.resultId, firstReceipt.resultId);
  assert.equal(backend.folder("Participant").files.length, 0, "the consented original lives only in the shared base folder");
  assert.equal(backend.folder("Artist").files.filter(file => file.getId() === first.originalId).length, 1);
  assert.equal(backend.folder("Double exposure").files.length, 2);
  const rows = [...backend.books.values()][0].getSheetByName("Submissions").rows;
  const secondRow = rows.find((row) => row.includes(second.submissionId));
  assert.equal(secondRow[13], true, "a re-pair inherits consent");
  assert.equal(secondRow[14], first.submissionId);
  assert.match(secondRow[15], /^[a-f0-9]{64}$/, "the assigned base's content is pinned");
});

test("a re-pair cannot reuse the same base when no alternative is available", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.refresh();
  const first = backend.begin(1, 22);
  assert.equal(backend.data("complete", backend.completePayload(first)).canRePair, false);
  const attempt = backend.api("begin", { submissionId: submissionId(2), reuse: { submissionId: first.submissionId, token: first.token } });
  assert.equal(attempt.ok, false);
  assert.equal(attempt.error.code, "NO_ALTERNATIVE_BASE");
  assert.equal(backend.folder("Participant").files.length, 1);
  assert.equal(backend.folder("Double exposure").files.length, 1);
});

for (const consent of [false, true]) {
  test(`a same-pair colour variant preserves exact inputs, consent ${consent}, and duplicate-free archives`, () => {
    const backend = makeBackend(); backend.setup(); backend.seed(1); backend.refresh();
    const first = backend.begin(1, 22, consent);
    const firstResult = backend.completePayload(first, 90);
    const saved = backend.data("complete", firstResult);
    const originalName = backend.files.get(first.originalId).getName();
    const request = { submissionId: submissionId(2), reuse: { submissionId: first.submissionId, token: first.token, sameBase: true } };
    const variant = backend.data("begin", request);
    assert.equal(variant.originalId, first.originalId);
    assert.deepEqual(variant.base, first.base);
    assert.notEqual(variant.token, first.token);
    assert.deepEqual(backend.data("begin", request), variant);
    const nextResult = backend.completePayload(variant, 91);
    nextResult.settings.monochrome = true;
    const nextSaved = backend.data("complete", nextResult);
    assert.equal(nextSaved.baseId, saved.baseId);
    assert.equal(backend.files.get(first.originalId).getName(), originalName);
    assert.equal(backend.records("Sources").filter(source => source.kind === "participant").length, 1);
    assert.equal(backend.folder("Double exposure").files.length, 2);
    const row = backend.records("Submissions").find(row => row.submissionId === variant.submissionId);
    assert.equal(row.allowReuse, consent);
    assert.equal(row.parentSubmissionId, first.submissionId);
    assert.equal(row.baseSha256, backend.records("Submissions")[0].baseSha256);
    assert.equal(JSON.parse(row.settingsJson).monochrome, true);
    assert.equal(backend.folder(consent ? "Artist" : "Participant").files.filter(file => file.getId() === first.originalId).length, 1);

    const back = backend.data("begin", { submissionId: submissionId(3), reuse: { submissionId: variant.submissionId, token: variant.token, sameBase: true } });
    const backSaved = backend.data("complete", { ...firstResult, submissionId: back.submissionId, token: back.token });
    assert.equal(backSaved.resultId, saved.resultId, "identical finished bytes reuse the first colour version's archived file");
    assert.equal(backend.folder("Double exposure").files.length, 2);
    assert.equal(backend.files.get(first.originalId).getName(), originalName);
  });
}

test("same-pair variants work with one base even when another pairing is unavailable", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.refresh();
  const first = backend.begin(1, 22);
  assert.equal(backend.data("complete", backend.completePayload(first)).canRePair, false);
  const variant = backend.data("begin", { submissionId: submissionId(2), reuse: { submissionId: first.submissionId, token: first.token, sameBase: true } });
  assert.equal(variant.base.id, first.base.id);
  const receipt = backend.data("complete", backend.completePayload(variant, 91));
  assert.equal(receipt.canRePair, false);
});

test("same-pair variants reject invalid flag types and require a completed authenticated parent", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.refresh();
  const first = backend.begin(1, 22);
  const reuse = { submissionId: first.submissionId, token: first.token, sameBase: true };
  assert.equal(backend.api("begin", { submissionId: submissionId(2), reuse }).error.code, "INVALID_TOKEN");
  backend.data("complete", backend.completePayload(first));
  for (const sameBase of [null, 0, 1, "true", "false", [], {}]) {
    assert.equal(backend.api("begin", { submissionId: submissionId(2), reuse: { ...reuse, sameBase } }).error.code, "INVALID_REQUEST");
  }
  assert.equal(backend.api("begin", { submissionId: submissionId(2), reuse: { ...reuse, token: "wrong-token" } }).error.code, "INVALID_TOKEN");
  assert.equal(backend.api("begin", { submissionId: submissionId(2), reuse, allowReuse: true }).error.code, "INVALID_REQUEST");
  assert.equal(backend.folder("Participant").files.length, 1);
  assert.equal(backend.records("Submissions").length, 1);
});

test("a same-pair request cannot replace the parent's base with caller-selected IDs or hashes", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.seed(2); backend.refresh();
  const first = backend.begin(1, 22); backend.data("complete", backend.completePayload(first));
  const variant = backend.data("begin", { submissionId: submissionId(2), reuse: {
    submissionId: first.submissionId, token: first.token, sameBase: true, baseId: "caller-controlled-file-id", baseSha256: "a".repeat(64)
  } });
  assert.equal(variant.base.id, first.base.id);
  assert.deepEqual(variant.base, first.base);
});

test("a submission cannot switch between same-pair and different-pair intent", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.seed(2); backend.refresh();
  const first = backend.begin(1, 22); backend.data("complete", backend.completePayload(first));
  const reuse = { submissionId: first.submissionId, token: first.token };
  backend.data("begin", { submissionId: submissionId(2), reuse: { ...reuse, sameBase: true } });
  for (const requested of [reuse, { ...reuse, sameBase: false }]) {
    assert.equal(backend.api("begin", { submissionId: submissionId(2), reuse: requested }).error.code, "SUBMISSION_CONFLICT");
  }
  const another = backend.data("begin", { submissionId: submissionId(3), reuse });
  assert.deepEqual(backend.data("begin", { submissionId: submissionId(3), reuse: { ...reuse, sameBase: false } }), another);
  assert.equal(backend.api("begin", { submissionId: submissionId(3), reuse: { ...reuse, sameBase: true } }).error.code, "SUBMISSION_CONFLICT");
});

test("an older pending different-pair retry cannot be converted into a same-pair variant", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.refresh();
  const first = backend.begin(1, 22); backend.data("complete", backend.completePayload(first));
  const reuse = { submissionId: first.submissionId, token: first.token };
  assert.equal(backend.api("begin", { submissionId: submissionId(2), reuse }).error.code, "NO_ALTERNATIVE_BASE");
  assert.equal(backend.records("Submissions")[1].baseId, "");
  assert.equal(backend.api("begin", { submissionId: submissionId(2), reuse: { ...reuse, sameBase: true } }).error.code, "SUBMISSION_CONFLICT");
  backend.seed(2); backend.refresh();
  const retried = backend.data("begin", { submissionId: submissionId(2), reuse });
  assert.notEqual(retried.base.id, first.base.id);
});

test("same-pair retries preserve their pin after a failed base read and reject changed base bytes", () => {
  const backend = makeBackend(); backend.setup(); const artist = backend.seed(1); backend.refresh();
  const first = backend.begin(1, 22); backend.data("complete", backend.completePayload(first));
  const request = { submissionId: submissionId(2), reuse: { submissionId: first.submissionId, token: first.token, sameBase: true } };
  const read = artist.getBlob.bind(artist);
  artist.getBlob = () => { throw new Error("Temporary base read failure"); };
  assert.equal(backend.api("begin", request).error.code, "BASE_UNAVAILABLE");
  const pending = backend.records("Submissions")[1];
  assert.equal(pending.baseId, first.base.id);
  assert.equal(pending.baseSha256, backend.records("Submissions")[0].baseSha256);
  artist.getBlob = read;
  const retried = backend.data("begin", request);
  assert.equal(retried.token, pending.token);
  assert.deepEqual(retried.base, first.base);
  artist.blob = new backend.Blob(jpeg(2), "image/jpeg", artist.getName());
  artist.date = new Date("2026-10-29T12:01:00Z");
  backend.advance(60000);
  assert.equal(backend.api("begin", request).error.code, "BASE_UNAVAILABLE");
  assert.equal(backend.records("Submissions")[1].baseSha256, pending.baseSha256);
  assert.equal(backend.folder("Participant").files.length, 1);
  assert.equal(backend.folder("Double exposure").files.length, 1);
});

test("trusted website artist assets replace base-byte downloads while keeping pins and same-pair variants", () => {
  const backend = makeBackend(); backend.setup(); const artist = backend.seed(1); backend.refresh();
  const asset = assetFor(backend, artist.getId(), "été #1? 50%.jpg");
  backend.sandbox.artistAssetCatalog_ = () => ({ version: 1, photos: [asset] });
  const reads = backend.io.blobReads;
  const first = backend.begin(1, 22);
  assert.deepEqual(first.base, { id: artist.getId(), ...asset });
  assert.equal(first.base.base64, undefined);
  assert.equal(first.base.url, undefined);
  assert.equal(backend.io.blobReads, reads, "cached artist intake and base delivery must not download the original photograph");
  assert.deepEqual(backend.begin(1, 22), first);
  backend.data("complete", backend.completePayload(first));
  const variant = backend.data("begin", { submissionId: submissionId(2), reuse: { submissionId: first.submissionId, token: first.token, sameBase: true } });
  assert.deepEqual(variant.base, first.base);
  assert.equal(variant.originalId, first.originalId);
  assert.equal(backend.io.blobReads, reads);
  assert.equal(backend.records("Submissions")[1].baseSha256, asset.sha256);
});

test("website artist delivery retains full existing-file verification for duplicate original uploads", () => {
  const backend = makeBackend(); backend.setup(); const firstArtist = backend.seed(1); const secondArtist = backend.seed(2); backend.refresh();
  backend.sandbox.artistAssetCatalog_ = () => ({ version: 1, photos: [assetFor(backend, firstArtist.getId(), "one.jpg"), assetFor(backend, secondArtist.getId(), "two.jpg")] });
  const reads = backend.io.blobReads;
  const begun = backend.begin(1, 1);
  assert.equal(begun.originalId, firstArtist.getId());
  assert.equal(begun.base.id, secondArtist.getId(), "the identical artist photograph must still be excluded from its own pairing");
  assert.equal(backend.io.blobReads, reads + 1, "original archive deduplication still verifies its existing exact bytes");
  assert.equal(backend.folder("Participant").files.length, 0);
  assert.equal(begun.base.base64, undefined);
});

test("consented participant bases remain dynamic beside the fixed website artist library", () => {
  const backend = makeBackend(); backend.setup(); const artist = backend.seed(1); backend.refresh();
  backend.sandbox.artistAssetCatalog_ = () => ({ version: 1, photos: [assetFor(backend, artist.getId())] });
  const first = backend.begin(1, 22, true);
  backend.data("complete", backend.completePayload(first));
  const pool = backend.data("bootstrap");
  assert.equal(pool.artistCount, 1);
  assert.equal(pool.participantCount, 1);
  const second = backend.begin(2, 1);
  assert.equal(second.base.id, first.originalId);
  assert.equal(second.base.base64, jpeg(22).toString("base64"));
  assert.equal(second.base.path, undefined);
  assert.match(second.base.name, /^participant_photo_[1-9]\d*\.jpg$/);
});

test("configured artist assets exclude unmapped sources and never fall back to a different old pin", () => {
  const backend = makeBackend(); backend.setup(); const firstArtist = backend.seed(1); const secondArtist = backend.seed(2); backend.refresh();
  const firstAsset = assetFor(backend, firstArtist.getId(), "one.jpg");
  const secondAsset = assetFor(backend, secondArtist.getId(), "two.jpg");
  backend.sandbox.artistAssetCatalog_ = () => ({ version: 1, photos: [firstAsset] });
  assert.equal(backend.data("bootstrap").artistCount, 1);
  const first = backend.begin(1, 22);
  assert.equal(first.base.id, firstArtist.getId());
  backend.sandbox.artistAssetCatalog_ = () => ({ version: 1, photos: [secondAsset] });
  assert.equal(backend.api("begin", { submissionId: first.submissionId, original: original(22) }).error.code, "BASE_UNAVAILABLE");
  assert.equal(backend.records("Submissions")[0].baseId, firstArtist.getId());
  assert.equal(backend.records("Submissions")[0].baseSha256, firstAsset.sha256);
  assert.equal(backend.begin(2, 23).base.id, secondArtist.getId());
});

test("owner refresh counts matched catalog hashes once and reports ineligible catalog entries as unmatched", () => {
  const backend = makeBackend(); backend.setup();
  const one = backend.seed(1); const two = backend.seed(2); const three = backend.seed(3);
  backend.seed(1, "duplicate-one.jpg");
  const legacy = clone(backend.refresh());
  assert.equal(legacy.websiteAssetCount, undefined, "the legacy refresh payload is unchanged without a catalog");
  const photos = [assetFor(backend, one.getId(), "one.jpg"), assetFor(backend, two.getId(), "two.jpg"), assetFor(backend, three.getId(), "three.jpg")];
  backend.sandbox.artistAssetCatalog_ = () => ({ version: 1, photos });
  const all = clone(backend.refresh());
  assert.equal(all.websiteAssetCount, 3);
  assert.equal(all.websiteAssetCatalogCount, 3);
  assert.equal(all.unmatchedWebsiteAssetCount, 0);
  assert.equal(backend.records("Sources").length, 4, "duplicate source rows must not inflate matched hash counts");
  three.setTrashed(true);
  const missing = clone(backend.refresh());
  assert.equal(missing.websiteAssetCount, 2);
  assert.equal(missing.websiteAssetCatalogCount, 3);
  assert.equal(missing.unmatchedWebsiteAssetCount, 1);
  assert.equal(missing.complete, true);
  assert.equal(backend.records("Sources").find(source => source.sourceId === three.getId()).eligible, false);
  const logged = JSON.parse(backend.logs.at(-1));
  assert.equal(logged.websiteAssetCount, 2);
  assert.equal(logged.unmatchedWebsiteAssetCount, 1);
});

test("changed artist bytes cannot be returned under a trusted website asset's old hash", () => {
  const backend = makeBackend(); backend.setup(); const artist = backend.seed(1); backend.refresh();
  const asset = assetFor(backend, artist.getId());
  backend.sandbox.artistAssetCatalog_ = () => ({ version: 1, photos: [asset] });
  const first = backend.begin(1, 22);
  artist.blob = new backend.Blob(jpeg(2), "image/jpeg", artist.getName());
  artist.date = new Date("2026-10-29T12:01:00Z"); backend.advance(60000);
  assert.equal(backend.api("begin", { submissionId: first.submissionId, original: original(22) }).error.code, "BASE_UNAVAILABLE");
  assert.equal(backend.data("bootstrap").artistCount, 0);
  assert.equal(backend.records("Submissions")[0].baseSha256, asset.sha256);
});

test("artist asset catalogs reject malformed entries, arbitrary URLs and traversal paths", () => {
  const backend = makeBackend(); backend.setup(); const artist = backend.seed(1); backend.refresh();
  const asset = assetFor(backend, artist.getId());
  const bad = [{ version: 0, photos: [asset] }, { version: 1, photos: [] }, null, [],
    ...["https://attacker.example/photo.jpg", "../base.jpg", "assets/base-photos/", "assets/base-photos/.", "assets/base-photos/..",
      "assets/base-photos/../base.jpg", "assets/base-photos/sub/base.jpg", "assets/base-photos/sub\\base.jpg", "assets/base-photos/bad\nname.jpg"]
      .map(path => ({ version: 1, photos: [{ ...asset, path, name: path.split("/").at(-1) }] })),
    ...[{ sha256: "not-a-hash" }, { mimeType: "image/svg+xml" }, { byteLength: 0 }, { byteLength: 31 * 1024 * 1024 }, { name: "different.jpg" }]
      .map(change => ({ version: 1, photos: [{ ...asset, ...change }] })),
    { version: 1, photos: [asset, asset] }];
  for (const catalog of bad) {
    backend.sandbox.artistAssetCatalog_ = () => catalog;
    assert.equal(backend.api("bootstrap").error.code, "ASSET_CONFIGURATION");
  }
  backend.sandbox.artistAssetCatalog_ = "not-a-function";
  assert.equal(backend.api("bootstrap").error.code, "ASSET_CONFIGURATION");
  const literal = { ...asset, path: "assets/base-photos/%2E%2E%2Fphoto.jpg", name: "%2E%2E%2Fphoto.jpg" };
  backend.sandbox.artistAssetCatalog_ = () => ({ version: 1, photos: [literal] });
  assert.equal(backend.begin(1, 22).base.path, literal.path, "literal percent sequences are preserved for the browser's single-filename encoding");
});

test("another pairing rejects a forged token and cannot change opt-in", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.seed(2); backend.refresh();
  const first = backend.begin(1, 22); backend.data("complete", backend.completePayload(first));
  const previous = { submissionId: first.submissionId, token: "wrong-token" };
  assert.equal(backend.api("begin", { submissionId: submissionId(2), reuse: previous }).error.code, "INVALID_TOKEN");
  assert.equal(backend.api("begin", { submissionId: submissionId(2), reuse: { ...previous, token: first.token }, allowReuse: true }).error.code, "INVALID_REQUEST");
  const second = backend.data("begin", { submissionId: submissionId(2), reuse: { ...previous, token: first.token } });
  backend.data("complete", backend.completePayload(second, 91));
  assert.equal(backend.data("bootstrap").totalEligible, 2, "both artist bases only; inherited opt-out remains private");
});

test("a later participant can pair with an earlier participant, never their identical image", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.refresh();
  const first = backend.begin(1, 22, true); backend.data("complete", backend.completePayload(first));
  const second = backend.begin(2, 1);
  assert.equal(second.base.id, first.originalId, "the other participant is the only distinct eligible source");
  assert.notEqual(Buffer.from(second.base.base64, "base64").toString("hex"), jpeg(1).toString("hex"));
});

test("retrying the same upload and archive operation creates no extra copies", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(); backend.refresh();
  const begun = backend.begin(1, 22);
  const repeated = backend.begin(1, 22);
  assert.equal(repeated.originalId, begun.originalId);
  assert.equal(repeated.base.id, begun.base.id);
  assert.equal(repeated.token, begun.token);
  const request = backend.completePayload(begun);
  const saved = backend.data("complete", request);
  const retry = backend.data("complete", request);
  assert.deepEqual(retry, saved);
  assert.equal(backend.folder("Participant").files.length, 1);
  assert.equal(backend.folder("Double exposure").files.length, 1);
});

test("reusing a submission identifier with different photo bytes is rejected", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(); backend.refresh(); backend.begin(1, 22);
  const response = backend.api("begin", { submissionId: submissionId(1), original: original(23) });
  assert.equal(response.ok, false);
  assert.equal(backend.folder("Participant").files.length, 1);
});

test("a completed result cannot be replaced by different bytes or treatment settings", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(); backend.refresh(); const begun = backend.begin(1, 22);
  const request = backend.completePayload(begun);
  const saved = backend.data("complete", request);
  for (const conflict of [
    { ...request, result: original(91, "different.jpg") },
    { ...request, width: 641 },
    { ...request, settings: { ...request.settings, baseExposure: 0 } }
  ]) {
    const response = backend.api("complete", conflict);
    assert.equal(response.ok, false);
    assert.equal(response.error.code, "RESULT_CONFLICT");
  }
  assert.equal(backend.folder("Double exposure").files.length, 1);
  assert.deepEqual(backend.files.get(saved.resultId).blob.bytes, jpeg(90));
});

for (const boundary of ["source", "pending", "paired"]) {
  test(`an interrupted ${boundary} index write resumes without saving the original twice`, () => {
    const backend = makeBackend(); backend.setup(); backend.seed(); backend.refresh();
    backend.failures.sheetWrite = (sheet, values) => boundary === "source"
      ? sheet.name === "Sources" && values.some((row) => row.includes("participant"))
      : sheet.name === "Submissions" && values.some((row) => row.includes(boundary));
    const failed = backend.api("begin", { submissionId: submissionId(1), original: original(22) });
    assert.equal(failed.ok, false);
    assert.equal(backend.folder("Participant").files.length, 1);
    assert.deepEqual(backend.folder("Participant").files[0].blob.bytes, jpeg(22));
    const resumed = backend.begin(1, 22);
    assert.equal(resumed.originalId, backend.folder("Participant").files[0].getId());
    assert.equal(backend.folder("Participant").files.length, 1);
    assert.equal(backend.usage().length, 2, "the same submission and original keep one reservation each");
    assert.equal(backend.usage().reduce((sum, row) => sum + row[3], 0), jpeg(22).length);
    assert.equal(backend.data("bootstrap").totalEligible, 1);
    assert.equal(backend.lock.held, false);
  });
}

for (const boundary of ["saving", "complete", "eligible"]) {
  test(`an interrupted ${boundary} archive update resumes without duplicate composites`, () => {
    const backend = makeBackend(); backend.setup(); backend.seed(); backend.refresh(); const begun = backend.begin(1, 22, true);
    const request = backend.completePayload(begun);
    backend.failures.sheetWrite = (sheet, values) => boundary === "eligible"
      ? sheet.name === "Sources" && values.some((row) => row.includes("participant") && row.includes(true))
      : sheet.name === "Submissions" && values.some((row) => row.includes(boundary));
    const failed = backend.api("complete", request);
    assert.equal(failed.ok, false);
    assert.equal(failed.error.originalSaved, true);
    assert.equal(backend.data("bootstrap").totalEligible, 1, "failed completion must not expose the new original yet");
    const saved = backend.data("complete", request);
    assert.equal(saved.saved, true);
    assert.equal(backend.folder("Double exposure").files.length, 1);
    assert.deepEqual(backend.files.get(saved.resultId).blob.bytes, jpeg(90));
    assert.equal(backend.usage().length, 3, "an interrupted completion must not duplicate its byte reservation");
    assert.equal(backend.usage().reduce((sum, row) => sum + row[3], 0), jpeg(22).length + jpeg(90).length);
    assert.equal(backend.data("bootstrap").totalEligible, 2);
    assert.equal(backend.lock.held, false);
  });
}

test("duplicate participant files share one stored source while each result is retained", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(); backend.refresh();
  const first = backend.begin(1, 22, true); backend.data("complete", backend.completePayload(first, 90));
  const second = backend.begin(2, 22); backend.data("complete", backend.completePayload(second, 91));
  assert.equal(first.originalId, second.originalId);
  assert.equal(backend.folder("Participant").files.length, 0);
  assert.equal(backend.folder("Artist").files.filter(file => file.getId() === first.originalId).length, 1);
  assert.equal(backend.folder("Double exposure").files.length, 2);
  assert.equal(backend.data("bootstrap").totalEligible, 2, "a duplicate must not gain additional selection weight");
});

test("a participant or artist test reusing an artist photograph creates no extra physical copy", () => {
  const backend = makeBackend(); backend.setup(); const artist = backend.seed(1); backend.seed(2); backend.refresh();
  const begun = backend.begin(1, 1);
  assert.equal(Buffer.from(begun.base.base64, "base64").equals(jpeg(2)), true);
  backend.data("complete", backend.completePayload(begun));
  assert.equal(begun.originalId, artist.getId());
  assert.equal(backend.folder("Participant").files.length, 0, "the artist's existing file is the original archive reference");
  assert.equal(artist.getName(), "artist-1.jpg", "reusing an artist file must not rename it as a participant photo");
  assert.equal(artist.isParticipantPhoto(), false);
  assert.equal(backend.data("bootstrap").totalEligible, 2, "identical image content should have one place in the pool");
});

test("artist import ignores non-images, avoids duplicate weighting, and updates removed sources", () => {
  const backend = makeBackend(); backend.setup(); const artist = backend.seed(1, "=SUM(1,2).jpg");
  backend.seed(1, "copy.jpg"); backend.seed(2, "second.jpg");
  backend.seed(3, "not-a-photo.txt", "text/plain", Buffer.from("plain text"));
  const summary = backend.refresh();
  assert.equal(summary.artistCount, 2);
  assert.equal(backend.data("bootstrap").totalEligible, 2);
  const sources = [...backend.books.values()][0].getSheetByName("Sources");
  const artistRow = sources.rows.find((row) => row.includes(artist.getId()));
  assert.ok(artistRow.includes('"=SUM(1,2).jpg"'), "user filenames must be stored as data, never Sheet formulas");
  for (const file of backend.folder("Artist").files) if (file.getName() !== "second.jpg") file.setTrashed(true);
  backend.refresh();
  assert.equal(backend.data("bootstrap").totalEligible, 1);
});

test("a temporary artist-file read error does not erase the usable collection during refresh", () => {
  const backend = makeBackend(); backend.setup(); const artist = backend.seed(); backend.refresh();
  artist.date = new Date("2026-10-29T13:00:00Z");
  const read = artist.getBlob.bind(artist);
  let shouldFail = true;
  artist.getBlob = () => { if (shouldFail) { shouldFail = false; throw new Error("Temporary Drive read failure"); } return read(); };
  const summary = backend.refresh();
  assert.equal(summary.preserved, 1);
  assert.equal(backend.data("bootstrap").totalEligible, 1);
  assert.equal(backend.begin(1, 22).base.id, artist.getId());
});

test("a temporary base-read error can be retried without manually reimporting the artist collection", () => {
  const backend = makeBackend(); backend.setup(); const artist = backend.seed(); backend.refresh();
  const read = artist.getBlob.bind(artist);
  let shouldFail = true;
  artist.getBlob = () => { if (shouldFail) { shouldFail = false; throw new Error("Temporary Drive read failure"); } return read(); };
  const failed = backend.api("begin", { submissionId: submissionId(1), original: original(22) });
  assert.equal(failed.ok, false);
  assert.equal(failed.error.originalSaved, true);
  assert.equal(backend.data("bootstrap").totalEligible, 1, "a temporary read must not permanently disable the sole base");
  assert.equal(backend.begin(1, 22).base.id, artist.getId());
  assert.equal(backend.folder("Participant").files.length, 1);
});

test("the artist can exclude participant originals from pairing while retaining their archive", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(); backend.refresh(); const begun = backend.begin(1, 22);
  backend.data("complete", backend.completePayload(begun));
  backend.properties.set("INCLUDE_PARTICIPANT_PHOTOS", "false");
  const status = backend.data("bootstrap");
  assert.equal(status.includeParticipantPhotos, false);
  assert.equal(status.totalEligible, 1);
  assert.equal(backend.folder("Participant").files.length, 1);
  assert.equal(backend.folder("Double exposure").files.length, 1);
});

test("an invalid completion token cannot save a result or enable a source", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(); backend.refresh(); const begun = backend.begin(1, 22);
  const response = backend.api("complete", { ...backend.completePayload(begun), token: "not-the-submission-token" });
  assert.equal(response.ok, false);
  assert.equal(backend.folder("Double exposure").files.length, 0);
  assert.equal(backend.data("bootstrap").totalEligible, 1);
});

test("a submission saved before a missing-base error can be resumed after artist seeding", () => {
  const backend = makeBackend(); backend.setup();
  const response = backend.api("begin", { submissionId: submissionId(1), original: original(22) });
  assert.equal(response.ok, false);
  assert.equal(response.error.originalSaved, true);
  assert.equal(backend.folder("Participant").files.length, 1);
  backend.seed(); backend.refresh();
  const resumed = backend.begin(1, 22);
  assert.deepEqual(backend.files.get(resumed.originalId).blob.bytes, jpeg(22));
  assert.equal(backend.folder("Participant").files.length, 1);
});

test("photo validation rejects forged formats and malformed data before storage", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(); backend.refresh();
  for (const image of [
    { name: "fake.png", mimeType: "image/png", base64: jpeg(1).toString("base64") },
    { name: "broken.jpg", mimeType: "image/jpeg", base64: "not valid base64!" },
    { name: "code.svg", mimeType: "image/svg+xml", base64: Buffer.from("<svg/>").toString("base64") }
  ]) {
    assert.equal(backend.api("begin", { submissionId: submissionId(1), original: image }).ok, false);
  }
  assert.equal(backend.folder("Participant").files.length, 0);
});

test("editor setup launchers are visible and owner-only, with private implementation helpers", () => {
  const backend = makeBackend();
  const functions = [...backend.source.matchAll(/^function\s+([A-Za-z0-9_]+)\s*\(/gm)].map((match) => match[1]);
  assert.deepEqual(functions.filter((name) => !name.endsWith("_")).sort(), ["artistApi", "doGet", "exposureApi", "refreshArtistCollection", "setupProject"]);
  assert.equal(backend.api("setupProject_").ok, false);
  assert.equal(backend.api("setupProject").ok, false);
  assert.equal(backend.api("refreshArtistCollection").ok, false);
});

test("anonymous and other-account callers cannot invoke editor setup launchers", () => {
  for (const identity of [
    { activeEmail: "" },
    { activeEmail: "visitor@example.test" },
    { activeEmail: "", effectiveEmail: "" },
    { effectiveEmail: "" }
  ]) {
    const backend = makeBackend(identity);
    for (const operation of ["setupProject", "refreshArtistCollection"]) {
      assert.throws(() => backend.sandbox[operation](), /owner's account/);
      assert.equal(backend.folders.size, 0);
      assert.equal(backend.books.size, 0);
      assert.equal(backend.lock.count, 0);
    }
  }
});

test("the owner identity check has its required email scope in the manifest", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(project, "google-apps-script", "appsscript.json"), "utf8"));
  assert.ok(manifest.oauthScopes.includes("https://www.googleapis.com/auth/userinfo.email"));
});

test("Google authorization permits artist reads while keeping writes limited to app-created files", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(project, "google-apps-script", "appsscript.json"), "utf8"));
  assert.deepEqual(manifest.oauthScopes.slice().sort(), [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/script.external_request"
  ].sort());
  assert.deepEqual(manifest.dependencies.enabledAdvancedServices, [
    { userSymbol: "Drive", serviceId: "drive", version: "v3" },
    { userSymbol: "Sheets", serviceId: "sheets", version: "v4" }
  ]);
  for (const name of ["Code.gs", "Storage.gs"]) {
    const code = fs.readFileSync(path.join(project, "google-apps-script", name), "utf8");
    assert.doesNotMatch(code, /\b(?:DriveApp|SpreadsheetApp)\b/, "broad-scope Google services must not return");
  }
});

test("owner imports preserve original bytes, index immediately and deduplicate renamed copies", () => {
  const backend = makeBackend(); backend.setup();
  backend.properties.set("UPLOADS_PAUSED", "true");
  backend.properties.set("UPLOAD_BYTES_PER_DAY", "1");
  const rpc = (action, payload) => clone(backend.sandbox.artistApi({ action, payload }));
  assert.equal(rpc("status").data.artistCount, 0);
  const first = rpc("import", { image: original(7, "first.jpg") });
  assert.equal(first.ok, true);
  assert.deepEqual(first.data, { imported: true, duplicate: false, artistCount: 1, name: "first.jpg" });
  const copy = rpc("import", { image: original(7, "renamed-copy.jpg") });
  assert.deepEqual(copy.data, { imported: false, duplicate: true, artistCount: 1, name: "renamed-copy.jpg" });
  assert.equal(backend.folder("Artist").files.length, 1);
  assert.deepEqual(backend.folder("Artist").files[0].getBlob().bytes, jpeg(7));
  assert.equal(backend.usage().length, 0, "owner imports are not visitor intake");
  const status = rpc("status").data;
  assert.equal(status.maxOriginalBytes, 30 * 1024 * 1024);
  assert.deepEqual(Object.keys(status.folders).sort(), ["artist", "originals", "results", "root"]);
  assert.equal(rpc("refresh").data.artistCount, 1);
  backend.properties.set("UPLOADS_PAUSED", "false");
  assert.equal(backend.data("bootstrap").artistCount, 1);
});

test("an interrupted artist index write recovers its app-created image without another copy", () => {
  const backend = makeBackend(); backend.setup();
  backend.failures.sheetWrite = (sheet, rows) => sheet.name === "Sources" && rows.some(row => row.includes("artist"));
  const request = { action: "import", payload: { image: original(7) } };
  assert.equal(backend.sandbox.artistApi(request).ok, false);
  assert.equal(backend.folder("Artist").files.length, 1);
  const resumed = clone(backend.sandbox.artistApi(request));
  assert.equal(resumed.ok, true);
  assert.equal(resumed.data.duplicate, true);
  assert.equal(resumed.data.artistCount, 1);
  assert.equal(backend.folder("Artist").files.length, 1);
  assert.equal(backend.data("bootstrap").totalEligible, 1);
});

test("owner imports reject forged photos and arbitrary existing file IDs", () => {
  const backend = makeBackend(); backend.setup();
  for (const payload of [
    { fileId: "unrelated-personal-photo" },
    { image: { ...original(7), mimeType: "image/png" } },
    { image: { ...original(7), base64: "not base64" } },
    { image: { ...original(7), mimeType: "image/svg+xml" } }
  ]) assert.equal(backend.sandbox.artistApi({ action: "import", payload }).ok, false);
  assert.equal(backend.folder("Artist").files.length, 0);
  for (const action of ["import", "status", "artistApi", "refresh"]) assert.equal(backend.api(action).ok, false);
});

test("anonymous and other accounts cannot open the owner page or call any owner RPC", () => {
  for (const identity of [{ activeEmail: "" }, { activeEmail: "visitor@example.test" }, { effectiveEmail: "" }]) {
    const backend = makeBackend(identity);
    for (const action of ["status", "import", "refresh"]) {
      const response = clone(backend.sandbox.artistApi({ action, email: "owner@example.test", payload: { image: original(7) } }));
      assert.equal(response.error.code, "OWNER_REQUIRED");
    }
    const html = backend.sandbox.doGet({ parameter: { view: "artist", email: "owner@example.test" } }).getContent();
    assert.doesNotMatch(html, /artist-import\.(?:js|css)/);
    assert.match(html, /signed into the account/);
    assert.equal(backend.lock.count, 0);
    assert.equal(backend.folders.size, 0);
  }
});

test("the owner's import page uses external assets and keeps default framing protection", () => {
  const backend = makeBackend();
  const page = backend.sandbox.doGet({ parameter: { view: "artist" } });
  const html = page.getContent();
  assert.match(html, /https:\/\/artist\.example\/exposures\/artist-import\.js\?v=drive-file-v1/);
  assert.match(html, /https:\/\/artist\.example\/exposures\/artist-import\.css\?v=drive-file-v1/);
  assert.doesNotMatch(html, /__[A-Z_]+__|getOAuthToken|access_token|refresh_token|<style\b|\sstyle=|\sonclick=/i);
  assert.doesNotMatch(html, /<script\b[^>]*>\s*\S[\s\S]*?<\/script>/i);
  assert.equal(page.frameMode, undefined, "the private page must not opt into framing by arbitrary websites");
});

test("the bridge is served only to permitted origins and escapes its metadata", () => {
  const backend = makeBackend(); backend.setup();
  const channel = "a".repeat(32);
  const valid = backend.sandbox.doGet({ parameter: { origin: "https://artist.example", channel } });
  const html = valid.getContent();
  assert.match(html, /https:\/\/script\.google\.com\/macros\/s\/deployment-example\/exec\?asset=bridge/);
  assert.doesNotMatch(html, /artist\.example\/exposures\/drive-bridge\.js/);
  assert.match(html, new RegExp(channel));
  assert.doesNotMatch(html, /__[A-Z_]+__/);
  assert.doesNotMatch(html, /<script\b[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i);
  assert.equal(valid.frameMode, "ALLOWALL");
  for (const origin of ["https://attacker.example", "https://artist.example.attacker.example", "null"]) {
    const output = backend.sandbox.doGet({ parameter: { origin, channel } });
    assert.doesNotMatch(output.getContent(), /<script\b|asset=bridge/);
  }
});

test("the bridge JavaScript asset is fixed public code without property or archive access", () => {
  const backend = makeBackend({ activeEmail: "", effectiveEmail: "" });
  backend.properties.clear();
  backend.properties.set("PRIVATE_SENTINEL", "must-not-appear-in-bridge-source");
  backend.properties.set("UPLOADS_PAUSED", "true");
  const page = backend.sandbox.doGet({ parameter: { asset: "bridge" } });
  const source = page.getContent();
  assert.equal(page.mimeType, "JAVASCRIPT");
  assert.match(source, /double-exposure-archive-v1/);
  assert.doesNotThrow(() => new vm.Script(source));
  assert.doesNotMatch(source, /PropertiesService|ArchiveDrive|ArchiveSheets|ScriptApp|getOAuthToken|PRIVATE_SENTINEL|must-not-appear/);
  const withUntrustedParameters = backend.sandbox.doGet({ parameter: {
    asset: "bridge", view: "artist", origin: "\"><script>alert(1)</script>", channel: "private-value", callback: "alert(2)"
  } });
  assert.equal(withUntrustedParameters.getContent(), source, "request values must not enter executable content");
  assert.equal(backend.io.propertyReads, 0);
  assert.equal(backend.io.driveCalls, 0);
  assert.equal(backend.lock.count, 0);
  assert.equal(backend.folders.size, 0);
  assert.equal(backend.books.size, 0);
  assert.equal(backend.files.size, 0);
});

test("unknown asset names return no executable source or caller-supplied content", () => {
  const backend = makeBackend();
  backend.properties.clear();
  for (const asset of ["", "__proto__", "artist", "../Code.gs", "bridge;alert(1)", "<script>alert(1)</script>", ["bridge"], {}]) {
    const page = backend.sandbox.doGet({ parameter: { asset } });
    assert.equal(page.mimeType, undefined);
    assert.equal(page.getContent(), "The exposure archive connection is unavailable.");
    assert.doesNotMatch(page.getContent(), /<script\b|exposureBridgeClient_|alert\(|private/);
  }
  assert.equal(backend.io.propertyReads, 0);
  assert.equal(backend.io.driveCalls, 0);
  assert.equal(backend.lock.count, 0);
});

test("the bridge refuses undeployed and untrusted script URLs", () => {
  for (const deploymentUrl of [null, "", "http://script.google.com/macros/s/example/exec", "https://script.google.com.attacker.example/macros/s/example/exec", "https://script.google.com/macros/s/example/dev", "https://user:password@script.google.com/macros/s/example/exec", "https://script.google.com/macros/s/example/exec?asset=other", "https://script.google.com/macros/s/example/exec\"><script>alert(1)</script>"]) {
    const backend = makeBackend({ deploymentUrl });
    const page = backend.sandbox.doGet({ parameter: { origin: "https://artist.example", channel: "a".repeat(32) } });
    assert.equal(page.getContent(), "The exposure archive connection is unavailable.");
    assert.doesNotMatch(page.getContent(), /<script\b|asset=bridge/);
  }
});

test("global request limits persist across calls and reopen at the next UTC minute", () => {
  const backend = makeBackend(); backend.setup();
  backend.properties.set("REQUESTS_PER_MINUTE", "2");
  backend.data("bootstrap");
  backend.data("bootstrap");
  assert.equal(backend.api("bootstrap").error.code, "RATE_LIMITED");
  assert.equal(JSON.parse(backend.properties.get("EXPOSURE_REQUEST_WINDOW")).count, 2);
  backend.advance(60000);
  backend.data("bootstrap");
  assert.equal(JSON.parse(backend.properties.get("EXPOSURE_REQUEST_WINDOW")).count, 1);
  assert.equal(backend.lock.held, false);
});

test("the pause switch blocks visitor writes while owner setup and import remain usable", () => {
  const backend = makeBackend(); backend.setup(); backend.seed();
  backend.properties.set("UPLOADS_PAUSED", "true");
  backend.setup(); backend.refresh();
  assert.equal(backend.api("bootstrap").error.code, "UPLOADS_PAUSED");
  assert.equal(backend.api("begin", { submissionId: submissionId(1), original: original(22) }).error.code, "UPLOADS_PAUSED");
  assert.equal(backend.folder("Participant").files.length, 0);
  assert.equal(backend.usage().length, 0);
  backend.properties.set("UPLOADS_PAUSED", "false");
  backend.begin(1, 22);
  backend.properties.set("UPLOADS_PAUSED", "true");
  assert.equal(backend.api("complete", {}).error.code, "UPLOADS_PAUSED");
  assert.equal(backend.folder("Double exposure").files.length, 0);
});

test("daily submission caps count another pairing but never charge a stable retry twice", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.seed(2); backend.refresh();
  backend.properties.set("SUBMISSIONS_PER_DAY", "1");
  const first = backend.begin(1, 22);
  assert.deepEqual(backend.begin(1, 22), first);
  backend.data("complete", backend.completePayload(first));
  const request = { submissionId: submissionId(2), reuse: { submissionId: first.submissionId, token: first.token } };
  assert.equal(backend.api("begin", request).error.code, "DAILY_LIMIT_REACHED");
  assert.equal(backend.folder("Participant").files.length, 1);
  assert.equal(backend.usage().filter((row) => row[2] === "submission").length, 1);
  backend.advance(86400000);
  const second = backend.data("begin", request);
  assert.equal(second.originalId, first.originalId);
  assert.notEqual(second.base.id, first.base.id);
  assert.equal(backend.folder("Participant").files.length, 1);
  assert.equal(backend.usage().filter((row) => row[2] === "submission").length, 2);
});

test("daily byte caps count only newly stored files and reset without deleting archive files", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(); backend.refresh();
  const bytes = jpeg(22).length;
  backend.properties.set("UPLOAD_BYTES_PER_DAY", String(bytes * 2));
  const first = backend.begin(1, 22);
  const firstRequest = backend.completePayload(first);
  backend.data("complete", firstRequest);
  backend.data("complete", firstRequest);
  const second = backend.begin(2, 22);
  assert.equal(second.originalId, first.originalId, "an identical new submission reuses its original at the byte limit");
  const failed = backend.api("complete", backend.completePayload(second, 91));
  assert.equal(failed.error.code, "DAILY_LIMIT_REACHED");
  assert.equal(failed.error.originalSaved, true);
  assert.equal(backend.folder("Participant").files.length, 1);
  assert.equal(backend.folder("Double exposure").files.length, 1);
  assert.equal(backend.usage().reduce((sum, row) => sum + row[3], 0), bytes * 2);
  backend.advance(86400000);
  backend.data("complete", backend.completePayload(second, 91));
  assert.equal(backend.folder("Double exposure").files.length, 2);
  assert.equal(backend.usage().reduce((sum, row) => sum + row[3], 0), bytes * 3);
  assert.equal(backend.usage().filter((row) => row[1] === "2026-10-30").reduce((sum, row) => sum + row[3], 0), bytes);
});

test("failed Drive creation retains one reservation that a retry can reuse at the byte cap", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(); backend.refresh();
  backend.properties.set("UPLOAD_BYTES_PER_DAY", String(jpeg(22).length));
  backend.failures.fileCreate = true;
  assert.equal(backend.api("begin", { submissionId: submissionId(1), original: original(22) }).ok, false);
  assert.equal(backend.folder("Participant").files.length, 0);
  const reserved = backend.usage();
  assert.equal(reserved.length, 2);
  backend.begin(1, 22);
  assert.deepEqual(backend.usage(), reserved);
  assert.equal(backend.folder("Participant").files.length, 1);
});

test("a failed quota reservation never proceeds to a Drive write", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(); backend.refresh();
  backend.failures.sheetWrite = (sheet, values) => sheet.name === "Usage" && values.some((row) => row.includes("file"));
  assert.equal(backend.api("begin", { submissionId: submissionId(1), original: original(22) }).ok, false);
  assert.equal(backend.folder("Participant").files.length, 0);
  assert.equal(backend.usage().length, 1, "the submission reservation remains conservative");
  backend.begin(1, 22);
  assert.equal(backend.folder("Participant").files.length, 1);
  assert.equal(backend.usage().length, 2);
});

test("an unused reservation from yesterday must fit today's limit before creating its file", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(); backend.refresh();
  const bytes = jpeg(22).length;
  backend.properties.set("UPLOAD_BYTES_PER_DAY", String(bytes));
  backend.failures.fileCreate = true;
  const delayed = { submissionId: submissionId(1), original: original(22) };
  assert.equal(backend.api("begin", delayed).ok, false);
  backend.advance(86400000);
  backend.begin(2, 23);
  assert.equal(backend.api("begin", delayed).error.code, "DAILY_LIMIT_REACHED");
  assert.equal(backend.folder("Participant").files.length, 1);
  backend.properties.set("UPLOAD_BYTES_PER_DAY", String(bytes * 2));
  backend.data("begin", delayed);
  assert.equal(backend.folder("Participant").files.length, 2);
  assert.equal(backend.usage().filter((row) => row[2] === "file").length, 2, "move the old reservation rather than add another charge");
  assert.equal(backend.usage().filter((row) => row[1] === "2026-10-30").reduce((sum, row) => sum + row[3], 0), bytes * 2);
});

test("malformed limit settings or persisted request state fail closed", () => {
  for (const [key, value] of [
    ["REQUESTS_PER_MINUTE", "0"], ["SUBMISSIONS_PER_DAY", "-1"], ["UPLOAD_BYTES_PER_DAY", ""],
    ["UPLOAD_BYTES_PER_DAY", "1.5"], ["REQUESTS_PER_MINUTE", "9007199254740992"], ["UPLOADS_PAUSED", "maybe"],
    ["EXPOSURE_REQUEST_WINDOW", "bad json"], ["EXPOSURE_REQUEST_WINDOW", '{"minute":0,"count":-1}'],
    ["EXPOSURE_REQUEST_WINDOW", '{"minute":9007199254740991,"count":0}']
  ]) {
    const backend = makeBackend(); backend.setup(); backend.seed(); backend.refresh();
    backend.properties.set(key, value);
    assert.equal(backend.api("begin", { submissionId: submissionId(1), original: original(22) }).error.code, "LIMIT_CONFIGURATION", `${key}=${value}`);
    assert.equal(backend.folder("Participant").files.length, 0);
    assert.equal(backend.lock.held, false);
  }
});

test("malformed usage records cannot turn into a fresh daily allowance", () => {
  for (const record of [
    ["file:old", "2026-10-29", "file", -1], ["file:old", "2026-02-31", "file", 1],
    ["file:old", "2026-10-30", "file", 1], ["submission:old", "2026-10-29", "submission", 1],
    ["file:old", "2026-10-29", "file", "9"]
  ]) {
    const backend = makeBackend(); backend.setup(); backend.seed(); backend.refresh();
    [...backend.books.values()][0].getSheetByName("Usage").rows.push(record);
    assert.equal(backend.api("begin", { submissionId: submissionId(1), original: original(22) }).error.code, "LIMIT_CONFIGURATION");
    assert.equal(backend.folder("Participant").files.length, 0);
  }
});

test("older indexes gain a usage ledger without changing their sources or submissions", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(); backend.refresh();
  const first = backend.begin(1, 22);
  const book = [...backend.books.values()][0];
  const before = clone(book.getSheetByName("Submissions").rows);
  book.deleteSheet(book.getSheetByName("Usage"));
  backend.data("bootstrap");
  assert.deepEqual(book.getSheetByName("Submissions").rows, before);
  assert.deepEqual(backend.begin(1, 22), first);
  assert.equal(backend.usage().length, 0, "migration does not retroactively charge existing files");
});

test("folder intake requires the configured project account before any Drive operation", () => {
  const mismatch = makeBackend({ activeEmail: "personal@example.test", effectiveEmail: "personal@example.test" });
  assert.throws(() => mismatch.setup(), (error) => error.exposureCode_ === "OWNER_ACCOUNT_MISMATCH");
  assert.equal(mismatch.io.driveCalls, 0);
  assert.equal(mismatch.folders.size, 0);

  const missing = makeBackend();
  missing.properties.delete("PROJECT_OWNER_EMAIL");
  assert.throws(() => missing.setup(), (error) => error.exposureCode_ === "NOT_CONFIGURED");
  assert.equal(missing.io.driveCalls, 0);

  const backend = makeBackend(); backend.setup(); backend.seed();
  backend.properties.set("PROJECT_OWNER_EMAIL", "different-project@example.test");
  const calls = backend.io.driveCalls;
  assert.equal(backend.api("bootstrap").error.code, "OWNER_ACCOUNT_MISMATCH");
  assert.equal(backend.io.driveCalls, calls, "visitor access must not read files under the wrong effective account");
});

test("ordinary Drive-folder photos are discovered automatically without an import RPC", () => {
  const backend = makeBackend(); backend.setup();
  const first = backend.seed(1, "a photograph.jpg");
  backend.seed(2, "another.jpg");
  backend.seed(1, "a renamed copy.jpg");
  const locks = backend.lock.count;
  const status = backend.data("bootstrap");
  assert.equal(status.artistCount, 2);
  assert.equal(status.totalEligible, 2);
  assert.equal(backend.lock.count, locks + 1, "automatic refresh shares the existing visitor lock");
  assert.equal(backend.lock.held, false);
  assert.equal(backend.folder("Artist").files.length, 3, "indexing does not create extra photograph copies");
  assert.equal(backend.folder("Participant").files.length, 0);
  const rows = backend.records("Sources");
  assert.equal(rows.length, 3, "duplicates retain metadata so later scans need not download them again");
  assert.equal(rows.filter((row) => row.eligible).length, 2);
  for (const row of rows) assert.match(row.modifiedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(rows.some((row) => row.sourceId === first.getId()));
});

test("automatic folder refresh caches unchanged images including duplicate files", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.seed(1, "duplicate.jpg");
  backend.data("bootstrap");
  const reads = backend.io.blobReads;
  const listings = backend.io.listings;
  const refreshed = backend.properties.get("EXPOSURE_ARTIST_REFRESHED_AT");
  assert.equal(reads, 2);
  assert.ok(refreshed);
  backend.advance(59999);
  backend.data("bootstrap");
  assert.equal(backend.io.listings, listings, "ordinary requests within a minute reuse the last complete inventory");
  backend.advance(1);
  assert.equal(backend.data("bootstrap").artistCount, 1);
  assert.equal(backend.io.listings, listings + 1);
  assert.equal(backend.io.blobReads, reads, "metadata-matching duplicate files also skip binary reads");
  assert.notEqual(backend.properties.get("EXPOSURE_ARTIST_REFRESHED_AT"), refreshed);
});

test("artist scans batch index writes and unchanged folders consume no new Source writes", () => {
  const backend = makeBackend(); backend.setup();
  backend.seed(1); backend.seed(2); backend.seed(3); backend.seed(1, "duplicate.jpg");
  const initialWrites = backend.io.sheetWrites.Sources;
  assert.equal(backend.data("bootstrap").artistCount, 3);
  assert.equal(backend.io.sheetWrites.Sources, initialWrites + 1, "one index write covers the whole new batch, including its inactive duplicate");

  backend.advance(60000);
  const indexedWrites = backend.io.sheetWrites.Sources;
  assert.equal(backend.data("bootstrap").artistCount, 3);
  assert.equal(backend.io.sheetWrites.Sources, indexedWrites, "a complete metadata scan of unchanged active and duplicate rows makes no Source write");

  backend.seed(4); backend.seed(5); backend.seed(6);
  backend.advance(60000);
  assert.equal(backend.data("bootstrap").artistCount, 6);
  assert.equal(backend.io.sheetWrites.Sources, indexedWrites + 1, "several new photos still require only one index write");
  assert.equal(backend.records("Sources").length, 7, "the update preserves earlier records as well as the duplicate's cached metadata");
});

test("changed file metadata invalidates the cached artist hash", () => {
  const backend = makeBackend(); backend.setup(); const artist = backend.seed(1);
  backend.data("bootstrap");
  const before = backend.io.blobReads;
  artist.blob = new backend.Blob(jpeg(2), "image/jpeg", "replaced.jpg");
  artist.date = new Date("2026-10-29T12:01:00Z");
  backend.advance(60000);
  assert.equal(backend.data("bootstrap").artistCount, 1);
  assert.equal(backend.io.blobReads, before + 1);
  const source = backend.records("Sources").find((record) => record.sourceId === artist.getId());
  assert.equal(source.sha256, crypto.createHash("sha256").update(jpeg(2)).digest("hex"));
  assert.equal(source.nameJson, '"replaced.jpg"');
  assert.equal(source.modifiedAt, artist.date.toISOString());
  assert.equal(Buffer.from(backend.begin(1, 22).base.base64, "base64").equals(jpeg(2)), true);
});

test("a begin retry never substitutes an edited artist file for its pinned base", () => {
  const backend = makeBackend(); backend.setup(); const artist = backend.seed(1);
  const first = backend.begin(1, 22);
  const pinned = backend.records("Submissions")[0].baseSha256;
  assert.equal(pinned, crypto.createHash("sha256").update(jpeg(1)).digest("hex"));
  artist.blob = new backend.Blob(jpeg(2), "image/jpeg", artist.getName());
  artist.date = new Date("2026-10-29T12:01:00Z");
  backend.seed(3, "alternative.jpg");
  backend.advance(60000);
  for (let attempt = 0; attempt < 2; attempt++) {
    const retry = backend.api("begin", { submissionId: first.submissionId, original: original(22) });
    assert.equal(retry.ok, false);
    assert.equal(retry.error.code, "BASE_UNAVAILABLE");
    assert.equal(retry.error.originalSaved, true);
    assert.equal(backend.records("Submissions")[0].baseId, first.base.id);
    assert.equal(backend.records("Submissions")[0].baseSha256, pinned);
  }
  assert.equal(backend.folder("Participant").files.length, 1);
});

test("metadata caching never replaces content verification for a previously assigned base", () => {
  const backend = makeBackend(); backend.setup(); const artist = backend.seed(1);
  const first = backend.begin(1, 22);
  const pinned = backend.records("Submissions")[0].baseSha256;
  // Even if a source keeps the same size and modification time, its actual
  // bytes must still match the photograph that this submission was assigned.
  artist.blob = new backend.Blob(jpeg(2), "image/jpeg", artist.getName());
  const retry = backend.api("begin", { submissionId: first.submissionId, original: original(22) });
  assert.equal(retry.ok, false);
  assert.equal(retry.error.code, "BASE_UNAVAILABLE");
  assert.equal(backend.records("Submissions")[0].baseSha256, pinned);
  artist.blob = new backend.Blob(jpeg(1), "image/jpeg", artist.getName());
  assert.deepEqual(backend.begin(1, 22), first, "restoring the assigned content allows the same stable retry");
  assert.equal(backend.folder("Participant").files.length, 1);
});

test("legacy assigned bases are durably pinned before a refresh can change their source hash", () => {
  const backend = makeBackend(); backend.setup(); const artist = backend.seed(1);
  const first = backend.begin(1, 22);
  const sheet = [...backend.books.values()][0].getSheetByName("Submissions");
  sheet.rows = sheet.rows.map((row) => row.slice(0, 15));
  const oldHash = crypto.createHash("sha256").update(jpeg(1)).digest("hex");
  artist.blob = new backend.Blob(jpeg(2), "image/jpeg", artist.getName());
  artist.date = new Date("2026-10-29T12:01:00Z");
  backend.advance(60000);
  for (let attempt = 0; attempt < 2; attempt++) {
    const retry = backend.api("begin", { submissionId: first.submissionId, original: original(22) });
    assert.equal(retry.error.code, "BASE_UNAVAILABLE");
    assert.equal(backend.records("Submissions")[0].baseSha256, oldHash);
  }
});

test("an eight-column source index gains modification metadata without changing existing source data", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.data("bootstrap");
  const sheet = [...backend.books.values()][0].getSheetByName("Sources");
  sheet.rows = sheet.rows.map((row) => row.slice(0, 8));
  const before = sheet.rows[1].slice();
  backend.advance(60000);
  assert.equal(backend.data("bootstrap").artistCount, 1);
  assert.equal(sheet.rows[0][8], "modifiedAt");
  assert.deepEqual(sheet.rows[1].slice(0, 8), before);
  assert.match(sheet.rows[1][8], /^\d{4}-\d{2}-\d{2}T/);
});

test("an incomplete artist listing preserves existing eligibility and is retried without a fresh timestamp", () => {
  const backend = makeBackend(); backend.setup(); const first = backend.seed(1); const removed = backend.seed(2);
  backend.data("bootstrap");
  const refreshed = backend.properties.get("EXPOSURE_ARTIST_REFRESHED_AT");
  removed.setTrashed(true);
  backend.advance(60000);
  const folder = backend.folder("Artist");
  const list = folder.getFiles.bind(folder);
  folder.getFiles = () => {
    let position = 0;
    return { hasNext: () => position < 2, next() { if (position++ === 0) return first; throw new Error("Incomplete Drive listing"); } };
  };
  backend.api("bootstrap");
  assert.equal(backend.properties.get("EXPOSURE_ARTIST_REFRESHED_AT"), refreshed);
  assert.equal(backend.records("Sources").find((record) => record.sourceId === removed.getId()).eligible, true);
  folder.getFiles = list;
  assert.equal(backend.data("bootstrap").artistCount, 1);
  assert.equal(backend.records("Sources").find((record) => record.sourceId === removed.getId()).eligible, false);
  assert.notEqual(backend.properties.get("EXPOSURE_ARTIST_REFRESHED_AT"), refreshed);
});

test("transient image-read failures preserve known eligibility without marking the scan fresh", () => {
  const backend = makeBackend(); backend.setup(); const artist = backend.seed(1);
  backend.data("bootstrap");
  const refreshed = backend.properties.get("EXPOSURE_ARTIST_REFRESHED_AT");
  artist.date = new Date("2026-10-29T12:01:00Z");
  backend.advance(60000);
  const read = artist.getBlob.bind(artist);
  artist.getBlob = () => { throw new Error("Temporary Drive read failure"); };
  backend.api("bootstrap");
  assert.equal(backend.properties.get("EXPOSURE_ARTIST_REFRESHED_AT"), refreshed);
  assert.equal(backend.records("Sources")[0].eligible, true);
  artist.getBlob = read;
  assert.equal(backend.data("bootstrap").artistCount, 1);
  assert.notEqual(backend.properties.get("EXPOSURE_ARTIST_REFRESHED_AT"), refreshed);
});

test("large new-folder batches make bounded progress without delaying every photo until a new minute", () => {
  const backend = makeBackend(); backend.setup();
  for (let index = 1; index <= 11; index++) backend.seed(index);
  const refreshed = backend.properties.get("EXPOSURE_ARTIST_REFRESHED_AT");
  assert.equal(backend.data("bootstrap").artistCount, 10);
  assert.equal(backend.io.blobReads, 10);
  assert.equal(backend.properties.get("EXPOSURE_ARTIST_REFRESHED_AT"), refreshed, "deferred files are not a complete fresh inventory");
  assert.equal(backend.data("bootstrap").artistCount, 11);
  assert.equal(backend.io.blobReads, 11, "the next request reuses ten cached files and reads only the deferred file");
  assert.ok(backend.properties.get("EXPOSURE_ARTIST_REFRESHED_AT"));
});

test("checksum-backed artist scans can index 113 photos using small probes instead of ten full reads", () => {
  const backend = makeBackend(); backend.setup();
  for (let index = 1; index <= 113; index++) backend.seed(index).driveChecksum = true;
  const scan = clone(backend.refresh());
  assert.equal(scan.artistCount, 113);
  assert.equal(scan.complete, true);
  assert.equal(backend.io.fingerprintReads, 113);
  assert.equal(backend.io.blobReads, 0);
  assert.ok(backend.properties.get("EXPOSURE_ARTIST_REFRESHED_AT"));
});

test("fingerprint count and elapsed-time budgets defer safely and resume from cached identities", () => {
  for (const budget of ["count", "time"]) {
    const backend = makeBackend(); backend.setup();
    if (budget === "count") backend.sandbox.EXPOSURE_CONFIG_ = { ...backend.sandbox.EXPOSURE_CONFIG_, maxArtistFingerprintProbes: 2 };
    for (let index = 1; index <= 3; index++) {
      const file = backend.seed(index); file.driveChecksum = true;
      if (budget === "time") file.onFingerprint = () => backend.advance(13000);
    }
    const first = clone(backend.refresh());
    assert.equal(first.artistCount, 2);
    assert.equal(first.complete, false);
    assert.equal(first.deferred, 1);
    assert.equal(backend.properties.has("EXPOSURE_ARTIST_REFRESHED_AT"), false);
    const next = clone(backend.refresh());
    assert.equal(next.artistCount, 3);
    assert.equal(next.complete, true);
    assert.equal(backend.io.fingerprintReads, 3, "cached files must not consume another probe");
  }
});

test("ignored Range responses consume the full-read budget without a second download", () => {
  const backend = makeBackend(); backend.setup();
  for (let index = 1; index <= 11; index++) {
    const file = backend.seed(index); file.driveChecksum = true; file.rangeIgnored = true;
  }
  const first = clone(backend.refresh());
  assert.equal(first.artistCount, 10);
  assert.equal(first.complete, false);
  assert.equal(backend.io.fingerprintReads, 10);
  assert.equal(backend.io.blobReads, 0, "the fingerprint already contains the verified full-response identity");
  assert.equal(clone(backend.refresh()).artistCount, 11);
  assert.equal(backend.io.fingerprintReads, 11);
});

test("ignored Range and failed response bodies count their actual bytes against the byte budget", () => {
  for (const failed of [false, true]) {
    const backend = makeBackend(); backend.setup();
    backend.sandbox.EXPOSURE_CONFIG_ = { ...backend.sandbox.EXPOSURE_CONFIG_, maxArtistReadBytes: 20 };
    for (let index = 1; index <= 3; index++) {
      const file = backend.seed(index); file.driveChecksum = true; file.rangeIgnored = true;
      if (failed) file.onFingerprint = () => {
        throw Object.assign(new Error("Buffered error response"), { scanFullRead_: true, scanBytes_: 12 });
      };
    }
    const scan = clone(backend.refresh());
    assert.equal(scan.complete, false);
    assert.equal(backend.io.fingerprintReads, failed ? 1 : 2);
    assert.equal(scan.deferred, failed ? 2 : 1, "actual error bytes may exceed the listed photo's size");
  }
});

test("failed full Range responses remain charged to the scan's full-read budget", () => {
  const backend = makeBackend(); backend.setup();
  for (let index = 1; index <= 11; index++) {
    const file = backend.seed(index); file.driveChecksum = true;
    file.onFingerprint = () => {
      throw Object.assign(new Error("Invalid full response"), { scanFullRead_: true, scanBytes_: file.getSize() });
    };
  }
  const scan = clone(backend.refresh());
  assert.equal(scan.artistCount, 0);
  assert.equal(scan.complete, false);
  assert.equal(scan.deferred, 1);
  assert.equal(backend.io.fingerprintReads, 10);
});

test("Drive SHA changes invalidate artist cache identity even when size and modified time stay the same", () => {
  const backend = makeBackend(); backend.setup();
  const artist = backend.seed(1); artist.driveChecksum = true;
  const first = backend.begin(1, 22);
  const pinned = backend.records("Submissions")[0].baseSha256;
  artist.blob = new backend.Blob(jpeg(2), "image/jpeg", artist.getName());
  const scan = clone(backend.refresh());
  assert.equal(scan.complete, true);
  const updated = backend.records("Sources").find(record => record.sourceId === artist.getId());
  assert.equal(updated.sha256, crypto.createHash("sha256").update(jpeg(2)).digest("hex"));
  assert.notEqual(updated.sha256, pinned);
  const retry = backend.api("begin", { submissionId: first.submissionId, original: original(22) });
  assert.equal(retry.error.code, "BASE_UNAVAILABLE");
  assert.equal(backend.records("Submissions")[0].baseSha256, pinned);
});

test("failed artist probes preserve the old index and refuse new-original storage until the scan completes", () => {
  const backend = makeBackend(); backend.setup();
  const artist = backend.seed(1); artist.driveChecksum = true;
  backend.refresh();
  artist.date = new Date("2026-10-29T12:01:00Z");
  artist.onFingerprint = () => { throw new Error("Invalid partial response"); };
  const before = backend.files.size;
  const request = backend.api("begin", { submissionId: submissionId(1), original: original(22) });
  assert.equal(request.error.code, "COLLECTION_REFRESHING");
  assert.equal(backend.files.size, before);
  assert.equal(backend.records("Sources")[0].eligible, true);
});

test("late consent moves one unchanged original into the base folder and retains participant provenance", () => {
  const backend = makeBackend(); backend.setup(); const artist = backend.seed(1); backend.seed(2); backend.refresh();
  const first = backend.begin(1, 22, false);
  backend.data("complete", backend.completePayload(first, 90));
  const participant = backend.files.get(first.originalId);
  const before = backend.files.size;
  assert.equal(participant.folder, backend.folder("Participant"));
  const optedIn = backend.begin(2, 22, true);
  assert.equal(optedIn.originalId, first.originalId);
  assert.equal(participant.folder, backend.folder("Participant"), "selecting consent alone does not expose an unfinished submission");
  const request = backend.completePayload(optedIn, 91);
  backend.data("complete", request);
  assert.equal(backend.files.size, before + 1, "only the new result is written; promoting the original is a move");
  assert.equal(participant.folder, backend.folder("Artist"));
  assert.match(participant.getName(), /^participant_photo_[1-9]\d*\.jpg$/);
  assert.deepEqual(participant.blob.bytes, jpeg(22));
  assert.equal(participant.isParticipantPhoto(), true);
  const promotedName = participant.getName();
  backend.refresh();
  const status = backend.data("bootstrap");
  assert.equal(status.artistCount, 2);
  assert.equal(status.participantCount, 1);
  assert.equal(backend.records("Sources").find(source => source.sourceId === participant.getId()).kind, "participant");
  backend.data("complete", request);
  backend.data("complete", backend.completePayload(first, 90));
  assert.equal(participant.getName(), promotedName, "retries retain the participant's assigned number");
  assert.equal(participant.folder, backend.folder("Artist"), "an earlier opt-out does not revoke a completed opt-in");
  assert.equal(artist.getName(), "artist-1.jpg");
  backend.properties.set("INCLUDE_PARTICIPANT_PHOTOS", "false");
  assert.equal(backend.data("bootstrap").totalEligible, 2, "participant provenance survives a folder scan and global exclusion");
});

test("different consenting participants receive distinct stable numbered names", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.refresh();
  const names = [];
  for (const number of [1, 2, 3]) {
    const begun = backend.begin(number, 20 + number, true);
    const request = backend.completePayload(begun, 80 + number);
    backend.data("complete", request);
    names.push(backend.files.get(begun.originalId).getName());
    backend.data("complete", request);
    assert.equal(backend.files.get(begun.originalId).getName(), names.at(-1));
  }
  assert.equal(new Set(names).size, 3);
  for (const name of names) assert.match(name, /^participant_photo_[1-9]\d*\.jpg$/);
  assert.equal(backend.folder("Participant").files.length, 0);
  assert.equal(backend.folder("Artist").files.length, 4);
});

test("moving a private participant original into My_photos never bypasses consent", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.refresh();
  const begun = backend.begin(1, 22, false);
  backend.data("complete", backend.completePayload(begun, 90));
  const originalFile = backend.files.get(begun.originalId);
  originalFile.moveTo(backend.folder("Artist"));
  originalFile.setName("looks-like-an-artist-photo.jpg");
  backend.refresh();
  assert.equal(backend.data("bootstrap").totalEligible, 1);
  const record = backend.records("Sources").find(source => source.sourceId === begun.originalId);
  assert.equal(record.kind, "participant");
  assert.equal(record.eligible, false);
});

test("a marked participant file without a completed consent record is not discovered as an artist base", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.refresh();
  const orphan = backend.seed(22, "participant_photo_123.jpg");
  orphan.markParticipantPhoto(orphan.getName());
  backend.refresh();
  const status = backend.data("bootstrap");
  assert.equal(status.artistCount, 1);
  assert.equal(status.participantCount, 0);
  assert.equal(backend.records("Sources").filter(source => source.sourceId === orphan.getId() && source.kind === "artist").length, 0);
});

for (const boundary of ["participantMark", "fileMove"]) {
  test(`a failed ${boundary} promotion retries without duplicate originals or a second participant number`, () => {
    const backend = makeBackend(); backend.setup(); backend.seed(1); backend.refresh();
    const begun = backend.begin(1, 22, true);
    const request = backend.completePayload(begun, 90);
    backend.failures[boundary] = true;
    const first = backend.api("complete", request);
    assert.equal(first.ok, false);
    assert.equal(first.error.originalSaved, true);
    const fileCount = backend.files.size;
    const receipt = backend.data("complete", request);
    const stored = backend.files.get(receipt.originalId);
    assert.equal(backend.files.size, fileCount, "retry repairs promotion rather than creating another image");
    assert.equal(stored.folder, backend.folder("Artist"));
    assert.match(stored.getName(), /^participant_photo_[1-9]\d*\.jpg$/);
    assert.equal(backend.folder("Participant").files.length, 0);
    assert.equal(backend.folder("Double exposure").files.length, 1);
    assert.equal(backend.data("bootstrap").participantCount, 1);
  });
}

test("identical finished exposures from separate submissions share one verified archived file", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.seed(2); backend.refresh();
  const receipts = [];
  for (const number of [1, 2, 3]) {
    const begun = backend.begin(number, 22, number === 1);
    receipts.push(backend.data("complete", backend.completePayload(begun, 90)));
  }
  assert.equal(new Set(receipts.map(receipt => receipt.originalId)).size, 1);
  assert.equal(new Set(receipts.map(receipt => receipt.resultId)).size, 1, "same result bytes must not create another Drive copy, including artist tests");
  assert.equal(backend.folder("Double exposure").files.length, 1);
  assert.equal(backend.folder("Artist").files.length, 3);
  assert.equal(backend.folder("Participant").files.length, 0);
  assert.equal(backend.records("Submissions").length, 3, "each exposure's receipt and consent history is still recorded");
  assert.equal(backend.usage().filter(row => row[2] === "file").length, 2, "one original and one unique result are charged");
});

test("a fresh Drive drop is checked before an identical test upload even inside the cached-scan interval", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.refresh();
  const dropped = backend.seed(22, "owner-new-photo.jpg");
  const begun = backend.begin(1, 22, true);
  assert.equal(begun.originalId, dropped.getId());
  backend.data("complete", backend.completePayload(begun, 90));
  assert.equal(backend.folder("Participant").files.length, 0);
  assert.equal(dropped.getName(), "owner-new-photo.jpg");
  assert.equal(dropped.isParticipantPhoto(), false);
  assert.equal(backend.data("bootstrap").artistCount, 2);
});

test("an existing completed exposure cannot be uploaded again as a new original copy", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.refresh();
  const first = backend.begin(1, 22);
  backend.data("complete", backend.completePayload(first, 90));
  const count = backend.files.size;
  const attempt = backend.api("begin", { submissionId: submissionId(2), original: original(90, "renamed-result.jpg"), allowReuse: true });
  assert.equal(attempt.ok, false);
  assert.equal(attempt.error.code, "ALREADY_ARCHIVED_RESULT");
  assert.equal(backend.files.size, count, "rejecting a cross-role duplicate must not create an original copy");
});

test("a composite identical to an existing base or its own original is rejected before another file write", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.refresh();
  const first = backend.begin(1, 22);
  const count = backend.files.size;
  for (const marker of [1, 22]) {
    const result = backend.api("complete", backend.completePayload(first, marker));
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "RESULT_MATCHES_SOURCE");
    assert.equal(backend.files.size, count);
    assert.equal(backend.folder("Double exposure").files.length, 0);
  }
});

test("a recorded legacy composite is reused by content regardless of its old submission-based filename", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.refresh();
  const first = backend.begin(1, 22);
  const saved = backend.data("complete", backend.completePayload(first, 90));
  const file = backend.files.get(saved.resultId);
  file.setName(`result-${first.submissionId}-${crypto.createHash("sha256").update(jpeg(90)).digest("hex")}.jpg`);
  const second = backend.begin(2, 23);
  const repeated = backend.data("complete", backend.completePayload(second, 90));
  assert.equal(repeated.resultId, saved.resultId);
  assert.equal(backend.folder("Double exposure").files.length, 1);
});

test("an unreadable recorded duplicate never causes a replacement copy to be silently written", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.refresh();
  const first = backend.begin(1, 22);
  const saved = backend.data("complete", backend.completePayload(first, 90));
  backend.files.get(saved.resultId).getBlob = () => { throw new Error("Temporary Drive read failure"); };
  const second = backend.begin(2, 23);
  const count = backend.files.size;
  const result = backend.api("complete", backend.completePayload(second, 90));
  assert.equal(result.ok, false);
  assert.equal(backend.files.size, count);
  assert.equal(backend.folder("Double exposure").files.length, 1);
});

test("unfinished bounded collection scans refuse new originals until duplicate checking can finish", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.refresh();
  for (let marker = 10; marker <= 21; marker++) backend.seed(marker);
  const attempt = backend.api("begin", { submissionId: submissionId(1), original: original(21), allowReuse: true });
  assert.equal(attempt.ok, false);
  assert.equal(attempt.error.code, "COLLECTION_REFRESHING");
  assert.equal(backend.folder("Participant").files.length, 0, "the duplicate check is incomplete, so no upload is saved yet");
  const retry = backend.begin(1, 21, true);
  assert.equal(backend.files.get(retry.originalId).folder, backend.folder("Artist"));
  assert.equal(backend.folder("Participant").files.length, 0);
});

test("owner test imports reuse private participant originals without granting consent or copying them", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.refresh();
  const begun = backend.begin(1, 22, false);
  backend.data("complete", backend.completePayload(begun, 90));
  const count = backend.files.size;
  const response = clone(backend.sandbox.artistApi({ action: "import", payload: { image: original(22, "artist-test-copy.jpg") } }));
  assert.equal(response.ok, true);
  assert.equal(response.data.duplicate, true);
  assert.equal(backend.files.size, count);
  assert.equal(backend.files.get(begun.originalId).folder, backend.folder("Participant"));
  assert.equal(backend.data("bootstrap").participantCount, 0, "the owner's repeated test does not manufacture participant consent");
  const rejected = clone(backend.sandbox.artistApi({ action: "import", payload: { image: original(90, "result-test-copy.jpg") } }));
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "ALREADY_ARCHIVED_RESULT");
  assert.equal(backend.files.size, count);
});

test("an interrupted old-version composite write is recovered after its filename convention changes", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.refresh();
  const first = backend.begin(1, 22);
  const payload = backend.completePayload(first, 90);
  backend.failures.sheetWrite = (sheet, values) => sheet.name === "Submissions" && values.some(row => row.includes("complete"));
  assert.equal(backend.api("complete", payload).ok, false);
  const file = backend.folder("Double exposure").files[0];
  const hash = crypto.createHash("sha256").update(jpeg(90)).digest("hex");
  file.setName(`result-${first.submissionId}-${hash}.jpg`);
  const before = backend.files.size;
  const saved = backend.data("complete", payload);
  assert.equal(saved.resultId, file.getId());
  assert.equal(backend.files.size, before);
  assert.equal(backend.folder("Double exposure").files.length, 1);
});

test("an unindexed original moved into My_photos blocks duplicate creation until its archive record is repaired", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.refresh();
  backend.failures.sheetWrite = (sheet, values) => sheet.name === "Sources" && values.some(row => row.includes("participant"));
  const failed = backend.api("begin", { submissionId: submissionId(1), original: original(22), allowReuse: true });
  assert.equal(failed.ok, false);
  const orphan = backend.folder("Participant").files[0];
  assert.match(orphan.getName(), /^source-[a-f0-9]{64}\.jpg$/);
  assert.equal(backend.records("Sources").some(source => source.sourceId === orphan.getId()), false);
  orphan.moveTo(backend.folder("Artist"));
  const count = backend.files.size;
  const retry = backend.api("begin", { submissionId: submissionId(1), original: original(22), allowReuse: true });
  assert.equal(retry.ok, false);
  assert.equal(retry.error.code, "COLLECTION_REFRESHING");
  assert.equal(backend.files.size, count, "an unverified orphan must never be followed by another physical copy");
  assert.equal(backend.folder("Participant").files.length, 0);
});

test("a participant-marked orphan in My_photos prevents unverified new original writes", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.refresh();
  const orphan = backend.seed(22, "participant_photo_123.jpg");
  orphan.markParticipantPhoto(orphan.getName());
  const count = backend.files.size;
  const request = backend.api("begin", { submissionId: submissionId(1), original: original(22), allowReuse: false });
  assert.equal(request.ok, false);
  assert.equal(request.error.code, "COLLECTION_REFRESHING");
  assert.equal(backend.files.size, count);
  assert.equal(backend.folder("Participant").files.length, 0);
  assert.equal(backend.records("Sources").some(source => source.sourceId === orphan.getId()), false, "a role marker cannot manufacture a consent record");
});

test("owner refresh identifies skipped image causes using bounded metadata diagnostics", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1, "valid.jpg");
  const oversized = backend.seed(22, "oversized.jpg");
  oversized.getSize = () => 30 * 1024 * 1024 + 1;
  backend.seed(23, "wrong-content.png", "image/png", jpeg(23));
  const changedLength = backend.seed(24, "changed-length.jpg");
  changedLength.getSize = () => jpeg(24).length + 1;
  backend.seed(25, "unsupported.heic", "image/heic", jpeg(25));
  const failedRead = backend.seed(26, "temporarily-unreadable.jpg");
  failedRead.getBlob = () => { throw new Error("private-authorization-token https://private.example/secret"); };
  const summary = clone(backend.refresh());
  assert.equal(summary.artistCount, 1);
  assert.equal(summary.skipped, 5);
  assert.equal(summary.complete, false, "a transient read failure remains retryable");
  const issues = Object.fromEntries(summary.issues.map(issue => [issue.name, issue]));
  assert.equal(issues["oversized.jpg"].reasonCode, "IMAGE_TOO_LARGE");
  assert.equal(issues["oversized.jpg"].bytes, 30 * 1024 * 1024 + 1);
  assert.deepEqual(issues["wrong-content.png"], { name: "wrong-content.png", reasonCode: "CONTENT_TYPE_MISMATCH", bytes: jpeg(23).length, mimeType: "image/png", detectedMime: "image/jpeg" });
  assert.equal(issues["changed-length.jpg"].reasonCode, "CONTENT_LENGTH_MISMATCH");
  assert.equal(issues["unsupported.heic"].reasonCode, "UNSUPPORTED_IMAGE");
  assert.equal(issues["temporarily-unreadable.jpg"].reasonCode, "READ_FAILED");
  assert.equal(summary.omittedIssues, 0);
  const logged = JSON.stringify({ summary, logs: backend.logs });
  assert.doesNotMatch(logged, /private-authorization-token|private\.example|base64|stack/);
  for (const issue of summary.issues) {
    assert.ok(Object.keys(issue).every(key => ["name", "reasonCode", "bytes", "mimeType", "detectedMime"].includes(key)), "diagnostics contain no image data or Drive file identifiers");
  }
});

test("owner refresh caps per-file diagnostics without losing the skipped-file count", () => {
  const backend = makeBackend(); backend.setup();
  for (let number = 0; number < 53; number++) backend.seed(number, `unsupported-${number}.heic`, "image/heic");
  const summary = clone(backend.refresh());
  assert.equal(summary.issues.length, 50);
  assert.equal(summary.omittedIssues, 3);
  assert.equal(summary.skipped, 53);
  assert.equal(backend.io.blobReads, 0, "unsupported metadata does not download image bytes");
});

test("anonymous collection bootstrap never exposes the owner's per-file diagnostics", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1, "valid.jpg");
  const oversized = backend.seed(22, "private-filename.jpg");
  oversized.getSize = () => 30 * 1024 * 1024 + 1;
  const summary = clone(backend.refresh());
  assert.equal(summary.issues[0].name, "private-filename.jpg");
  const publicStatus = backend.data("bootstrap");
  assert.equal(publicStatus.artistCount, 1);
  assert.equal("issues" in publicStatus, false);
  assert.equal("omittedIssues" in publicStatus, false);
  assert.doesNotMatch(JSON.stringify(publicStatus), /private-filename/);
});
