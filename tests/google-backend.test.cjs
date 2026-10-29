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

// In-memory fakes implement the Google service boundary. The application's
// real Apps Script is executed unchanged, so persistence and retry assertions
// exercise its actual public API rather than a second implementation of it.
function makeBackend({ activeEmail = "owner@example.test", effectiveEmail = "owner@example.test" } = {}) {
  let nextId = 0;
  const files = new Map();
  const folders = new Map();
  const books = new Map();
  const properties = new Map([["SITE_URL", "https://artist.example/exposures/"]]);
  const logs = [];
  const failures = { sheetWrite: null };
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
      this.trashed = false; this.date = new Date("2026-10-25T00:00:00Z");
      files.set(this.id, this);
      if (folder) folder.files.push(this);
    }
    getId() { return this.id; }
    getName() { return this.blob.name; }
    setName(value) { this.blob.name = value; return this; }
    getBlob() { return this.blob.copyBlob(); }
    getMimeType() { return this.blob.type; }
    getSize() { return this.blob.bytes.length; }
    getUrl() { return `https://drive.google.com/file/d/${this.id}/view`; }
    getDateCreated() { return this.date; }
    getLastUpdated() { return this.date; }
    isTrashed() { return this.trashed; }
    setTrashed(value) { this.trashed = value; return this; }
    getParents() { return iterator(this.folder ? [this.folder] : []); }
    moveTo(folder) {
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
    createFile(blob) { return new File(blob, this); }
    getFiles() { return iterator(this.files.filter((file) => !file.trashed)); }
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
    console: { log: (...values) => logs.push(values.join(" ")) },
    Logger: { log: (...values) => logs.push(values.join(" ")) },
    DriveApp: {
      createFolder: (name) => new Folder(name),
      getFoldersByName: (name) => iterator(Array.from(folders.values()).filter((folder) => folder.name === name)),
      getFolderById: (key) => { if (!folders.has(key)) throw new Error(`No folder ${key}`); return folders.get(key); },
      getFileById: (key) => { if (!files.has(key)) throw new Error(`No file ${key}`); return files.get(key); }
    },
    SpreadsheetApp: { create: (name) => new Book(name), openById: (key) => { if (!books.has(key)) throw new Error(`No book ${key}`); return books.get(key); }, flush() {} },
    LockService: { getScriptLock: () => lock },
    Session: {
      getActiveUser: () => ({ getEmail: () => activeEmail }),
      getEffectiveUser: () => ({ getEmail: () => effectiveEmail })
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key) => properties.get(key) ?? null,
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
    }
  });
  const source = fs.readFileSync(path.join(project, "google-apps-script", "Code.gs"), "utf8");
  vm.runInContext(source, sandbox, { timeout: 1000 });
  const api = (action, payload = {}) => clone(sandbox.exposureApi({ action, payload }));
  const data = (action, payload) => { const response = api(action, payload); assert.equal(response.ok, true, JSON.stringify(response)); return response.data; };
  const folder = (fragment) => {
    const matches = Array.from(folders.values()).filter((entry) => entry.name.toLowerCase().includes(fragment.toLowerCase()));
    return matches.find((entry) => /^\d+ /.test(entry.name)) || matches[0];
  };
  const seed = (marker = 1, name = `artist-${marker}.jpg`, mimeType = "image/jpeg", bytes = jpeg(marker)) => folder("Artist").createFile(new Blob(bytes, mimeType, name));
  const begin = (number, marker = number + 10, allowReuse = false) =>
    data("begin", { submissionId: submissionId(number), original: original(marker), allowReuse });
  const completePayload = (begun, marker = 90) => ({ submissionId: begun.submissionId, token: begun.token, result: original(marker, `${begun.submissionId}.jpg`), width: 640, height: 480, settings: { baseExposure: -1, participantExposure: -1, contrast: 0, monochrome: false } });
  const setup = () => sandbox.setupProject();
  const refresh = () => sandbox.refreshArtistCollection();
  return { sandbox, properties, files, folders, books, logs, failures, lock, source, api, data, folder, seed, begin, completePayload, setup, refresh, Blob };
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
  assert.deepEqual(sheet.rows[0].slice(13), ["allowReuse", "parentSubmissionId"]);
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
  assert.equal(backend.folder("Participant").files.length, 1);
  assert.equal(backend.folder("Double exposure").files.length, 2);
  const rows = [...backend.books.values()][0].getSheetByName("Submissions").rows;
  const secondRow = rows.find((row) => row.includes(second.submissionId));
  assert.equal(secondRow.at(-2), true, "a re-pair inherits consent");
  assert.equal(secondRow.at(-1), first.submissionId);
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
    assert.equal(backend.data("bootstrap").totalEligible, 2);
    assert.equal(backend.lock.held, false);
  });
}

test("duplicate participant files share one stored source while each result is retained", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(); backend.refresh();
  const first = backend.begin(1, 22, true); backend.data("complete", backend.completePayload(first, 90));
  const second = backend.begin(2, 22); backend.data("complete", backend.completePayload(second, 91));
  assert.equal(first.originalId, second.originalId);
  assert.equal(backend.folder("Participant").files.length, 1);
  assert.equal(backend.folder("Double exposure").files.length, 2);
  assert.equal(backend.data("bootstrap").totalEligible, 2, "a duplicate must not gain additional selection weight");
});

test("a participant copy of an artist photograph does not gain extra weight in the shared pool", () => {
  const backend = makeBackend(); backend.setup(); backend.seed(1); backend.seed(2); backend.refresh();
  const begun = backend.begin(1, 1);
  assert.equal(Buffer.from(begun.base.base64, "base64").equals(jpeg(2)), true);
  backend.data("complete", backend.completePayload(begun));
  assert.equal(backend.folder("Participant").files.length, 1, "the participant original is still archived");
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
  assert.deepEqual(functions.filter((name) => !name.endsWith("_")).sort(), ["doGet", "exposureApi", "refreshArtistCollection", "setupProject"]);
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

test("the bridge is served only to permitted origins and escapes its metadata", () => {
  const backend = makeBackend(); backend.setup();
  const channel = "a".repeat(32);
  const valid = backend.sandbox.doGet({ parameter: { origin: "https://artist.example", channel } });
  const html = valid.getContent();
  assert.match(html, /https:\/\/artist\.example\/exposures\/drive-bridge\.js/);
  assert.match(html, new RegExp(channel));
  assert.doesNotMatch(html, /__[A-Z_]+__/);
  assert.doesNotMatch(html, /<script\b[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i);
  assert.equal(valid.frameMode, "ALLOWALL");
  for (const origin of ["https://attacker.example", "https://artist.example.attacker.example", "null"]) {
    const output = backend.sandbox.doGet({ parameter: { origin, channel } });
    assert.doesNotMatch(output.getContent(), /drive-bridge\.js/);
  }
});
