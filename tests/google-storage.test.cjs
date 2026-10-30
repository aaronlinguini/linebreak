"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const source = fs.readFileSync(path.join(__dirname, "../google-apps-script/Storage.gs"), "utf8");
const folderType = "application/vnd.google-apps.folder";
const sheetType = "application/vnd.google-apps.spreadsheet";
const clone = value => JSON.parse(JSON.stringify(value));
const sha256 = bytes => crypto.createHash("sha256").update(Buffer.from(bytes)).digest("hex");

function fingerprintFixture(overrides = {}, bytes = [255, 216, 255, ...Array(125).fill(7)]) {
  const h = harness();
  const folder = h.addFile({ mimeType: folderType, isAppAuthorized: false, appProperties: {} }, []);
  const photo = h.addFile({ parents: [folder.id], isAppAuthorized: false, appProperties: {},
    sha256Checksum: sha256(bytes), version: "9007199254740992", ...overrides }, bytes);
  const file = h.drive.getArtistFileById(photo.id, folder.id);
  return { h, folder, photo, file, bytes };
}

function harness() {
  let nextId = 0;
  const files = new Map(), books = new Map();
  const calls = { get: [], create: [], list: [], update: [], fetch: [], sheets: [], valuesGet: [], valuesUpdate: [] };
  const controls = { pages: null, httpCode: 200, body: null, range: false, rangeHeaders: null, failValueWrite: false, failGet: null, onFetch: null };
  class Blob {
    constructor(bytes, mimeType, name) { this.bytes = [...bytes]; this.mimeType = mimeType; this.name = name; }
    getName() { return this.name; }
    getContentType() { return this.mimeType; }
    getBytes() { return [...this.bytes]; }
    setName(name) { this.name = name; return this; }
    setContentType(mimeType) { this.mimeType = mimeType; return this; }
  }
  function addFile(overrides = {}, bytes = [1, 2, -1]) {
    const id = overrides.id || `file-${++nextId}`;
    const file = { id, name: "image.jpg", mimeType: "image/jpeg", size: String(bytes.length), parents: [], trashed: false,
      isAppAuthorized: true, appProperties: { exposureArchive: "drive-file-v1" }, capabilities: { canDownload: true },
      createdTime: "2026-10-30T00:00:00Z", modifiedTime: "2026-10-30T01:00:00Z", ...overrides };
    files.set(id, { metadata: file, bytes: [...bytes] });
    return file;
  }
  function book(id) {
    const item = books.get(id);
    if (!item) throw new Error("Spreadsheet not found");
    return item;
  }
  function parseTitle(range) { return range.replace(/^'|'$/g, "").replace(/''/g, "'"); }
  const Drive = { Files: {
    get(id, options) {
      calls.get.push({ id, options: clone(options) });
      if (controls.failGet) throw new Error(controls.failGet);
      if (!files.has(id)) throw new Error("404 File not found");
      return clone(files.get(id).metadata);
    },
    create(resource, media, options) {
      assert.equal(arguments.length, 3, "metadata creates must explicitly pass a null media argument");
      assert.ok(options.fields.includes("isAppAuthorized"));
      assert.ok(options.fields.includes("appProperties"));
      assert.ok(media === null || media instanceof Blob);
      calls.create.push({ resource: clone(resource), media, options: clone(options) });
      return clone(addFile(resource, media ? media.getBytes() : []));
    },
    update(resource, id, media, options) {
      assert.equal(media, null);
      calls.update.push({ resource: clone(resource), id, options: clone(options) });
      const item = files.get(id);
      if (!item) throw new Error("404 File not found");
      Object.assign(item.metadata, clone(resource));
      if (options.removeParents) item.metadata.parents = item.metadata.parents.filter(parent => !options.removeParents.split(",").includes(parent));
      if (options.addParents) item.metadata.parents.push(options.addParents);
      return clone(item.metadata);
    },
    list(options) {
      calls.list.push(clone(options));
      if (controls.pages) return clone(controls.pages[options.pageToken ? Number(options.pageToken) : 0]);
      const parent = options.q.match(/^'([^']+)' in parents/)[1];
      const onlyFolders = options.q.includes(`mimeType = '${folderType}'`);
      const excludeFolders = options.q.includes(`mimeType != '${folderType}'`);
      return { files: [...files.values()].map(item => item.metadata).filter(file => file.parents.includes(parent) &&
        (!onlyFolders || file.mimeType === folderType) && (!excludeFolders || file.mimeType !== folderType) && !file.trashed) };
    }
  } };
  const Sheets = { Spreadsheets: {
    create(resource) {
      calls.sheets.push({ action: "create", resource: clone(resource) });
      const file = addFile({ name: resource.properties.title, mimeType: sheetType, appProperties: {} }, []);
      books.set(file.id, { spreadsheetId: file.id, sheets: resource.sheets.map((sheet, index) => ({ properties: {
        sheetId: index, title: sheet.properties.title, gridProperties: { rowCount: 2, columnCount: 2 }
      } })), values: { Sheet1: [] } });
      return { spreadsheetId: file.id };
    },
    get(id, options) {
      calls.sheets.push({ action: "get", id, options: clone(options) });
      const item = book(id);
      return clone({ spreadsheetId: id, sheets: item.sheets });
    },
    batchUpdate(body, id) {
      calls.sheets.push({ action: "batchUpdate", id, body: clone(body) });
      const item = book(id);
      for (const request of body.requests) {
        if (request.addSheet) {
          const title = request.addSheet.properties.title;
          item.sheets.push({ properties: { sheetId: item.sheets.length, title, gridProperties: { rowCount: 2, columnCount: 2 } } });
          item.values[title] = [];
        } else {
          const change = request.updateSheetProperties.properties;
          item.sheets.find(sheet => sheet.properties.sheetId === change.sheetId).properties.gridProperties = clone(change.gridProperties);
        }
      }
      return {};
    },
    Values: {
      get(id, range, options) {
        calls.valuesGet.push({ id, range, options: clone(options) });
        return { values: clone(book(id).values[parseTitle(range)]) };
      },
      update(body, id, range, options) {
        calls.valuesUpdate.push({ body: clone(body), id, range, options: clone(options) });
        if (controls.failValueWrite) { controls.failValueWrite = false; throw new Error("Temporary write failure"); }
        const match = range.match(/^'(.*)'!([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
        assert.ok(match, "values writes use a bounded quoted A1 range");
        const column = [...match[2]].reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0);
        const row = Number(match[3]);
        const rows = book(id).values[match[1].replace(/''/g, "'")];
        body.values.forEach((line, y) => line.forEach((value, x) => {
          rows[row + y - 1] ??= [];
          rows[row + y - 1][column + x - 1] = value;
        }));
        return {};
      }
    }
  } };
  const sandbox = vm.createContext({ Drive, Sheets,
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA_256" },
      computeDigest(algorithm, bytes) { assert.equal(algorithm, "SHA_256"); return [...crypto.createHash("sha256").update(Buffer.from(bytes)).digest()]; }
    },
    ScriptApp: { getOAuthToken: () => "private-test-token" },
    UrlFetchApp: { fetch(url, options) {
      calls.fetch.push({ url, options: clone(options) });
      const id = url.match(/\/files\/([A-Za-z0-9_-]+)\?alt=media$/)?.[1];
      assert.ok(id, "downloads go only to an internal Drive file ID");
      if (controls.onFetch) controls.onFetch(id);
      const item = files.get(id);
      const range = controls.range && options.headers.Range;
      const end = range ? Number(range.split("-")[1]) : item.bytes.length - 1;
      return { getResponseCode: () => range ? 206 : controls.httpCode,
        getAllHeaders: () => controls.rangeHeaders ?? { "Content-Range": `bytes 0-${end}/${item.bytes.length}` },
        getBlob: () => new Blob(controls.body || (range ? item.bytes.slice(0, end + 1) : item.bytes), "application/octet-stream", "download") };
    } }
  });
  vm.runInContext(source, sandbox);
  return { drive: sandbox.ArchiveDrive, sheets: sandbox.ArchiveSheets, files, books, calls, controls, addFile, Blob, sandbox };
}

function backendHarness() {
  const h = harness();
  const properties = new Map([["SITE_URL", "https://artist.example/exposures/"], ["PROJECT_OWNER_EMAIL", "owner@example.test"]]);
  const identity = { active: "owner@example.test", effective: "owner@example.test" };
  const signed = bytes => Array.from(bytes, value => value > 127 ? value - 256 : value);
  let locked = false;
  Object.assign(h.sandbox, {
    console: { log() {} },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties.get(key) ?? null,
      setProperty(key, value) { properties.set(key, String(value)); return this; }
    }) },
    Session: {
      getActiveUser: () => ({ getEmail: () => identity.active }),
      getEffectiveUser: () => ({ getEmail: () => identity.effective })
    },
    LockService: { getScriptLock: () => ({
      tryLock() { assert.equal(locked, false, "backend execution must not nest locks"); locked = true; return true; },
      releaseLock() { assert.equal(locked, true); locked = false; }
    }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA_256" },
      computeDigest(algorithm, bytes) { assert.equal(algorithm, "SHA_256"); return signed(crypto.createHash("sha256").update(Buffer.from(bytes)).digest()); },
      base64Decode: value => signed(Buffer.from(value, "base64")),
      base64Encode: bytes => Buffer.from(bytes).toString("base64"),
      newBlob: (bytes, mimeType, name) => new h.Blob(bytes, mimeType, name),
      getUuid: () => crypto.randomUUID()
    }
  });
  // This loads the real business logic over the real storage adapters, with
  // mocks only at the external Google API boundary.
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../google-apps-script/Code.gs"), "utf8"), h.sandbox);
  function api(action, payload = {}) {
    const response = clone(h.sandbox.exposureApi({ action, payload }));
    assert.equal(response.ok, true, JSON.stringify(response.error));
    return response.data;
  }
  function artist(action, payload = {}) {
    const response = clone(h.sandbox.artistApi({ action, payload }));
    assert.equal(response.ok, true, JSON.stringify(response.error));
    return response.data;
  }
  function records(name) {
    const rows = h.books.get(properties.get("EXPOSURE_SPREADSHEET_ID")).values[name];
    return rows.slice(1).map(row => Object.fromEntries(rows[0].map((header, index) => [header, row[index] ?? ""])));
  }
  return { ...h, properties, identity, api, artist, records };
}

function image(marker, name = `photo-${marker}.jpg`) {
  return { name, mimeType: "image/jpeg", base64: Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10,marker,0xff,0xd9]).toString("base64") };
}

test("folder and image creation use app markers, explicit Drive v3 media signatures and exact parents", () => {
  const h = harness();
  const root = h.drive.createFolder("Project");
  const artist = root.createFolder("My_photos");
  const image = artist.createFile(new h.Blob([9, 8, -1], "image/jpeg", "source.jpg"));
  assert.equal(image.getName(), "source.jpg");
  assert.equal(image.getSize(), 3);
  assert.equal(image.getMimeType(), "image/jpeg");
  assert.deepEqual(h.calls.create[0].resource.appProperties, { exposureArchive: "drive-file-v1" });
  assert.deepEqual(h.calls.create[1].resource.parents, [root.getId()]);
  assert.deepEqual(h.calls.create[2].resource.parents, [artist.getId()]);
  assert.equal(h.calls.create[0].media, null);
  assert.match(root.getUrl(), /^https:\/\/drive.google.com\/drive\/folders\//);
});

test("unapproved, unmarked, trashed and wrong-kind configured IDs fail before any download", () => {
  const h = harness();
  for (const override of [{ isAppAuthorized: false }, { isAppAuthorized: undefined }, { appProperties: {} }, { trashed: true }]) {
    const file = h.addFile(override);
    assert.throws(() => h.drive.getFileById(file.id), error => error.exposureCode_ === "ACCESS_NOT_GRANTED");
  }
  const folder = h.addFile({ mimeType: folderType });
  const image = h.addFile();
  assert.throws(() => h.drive.getFileById(folder.id), /limited-access/);
  assert.throws(() => h.drive.getFolderById(image.id), /limited-access/);
  for (const id of ["https://example.test/file", "file?id=1", "../file", "file\nother", "__proto__", "constructor", 5]) assert.throws(() => h.drive.getFileById(id), /limited-access/);
  assert.equal(h.calls.fetch.length, 0);
});

test("missing-file denial is useful to the owner while transient API failures remain retryable", () => {
  const h = harness();
  assert.throws(() => h.drive.getFolderById("missing"), error => error.exposureCode_ === "ACCESS_NOT_GRANTED");
  h.controls.failGet = "503 Backend temporarily unavailable";
  assert.throws(() => h.drive.getFileById("known-file"), /503 Backend temporarily unavailable/);
});

test("listing paginates completely and excludes unmarked, wrong-parent, wrong-name and wrong-kind files", () => {
  const h = harness();
  const root = h.drive.createFolder("Root");
  const file = h.addFile({ name: "chosen.jpg", parents: [root.getId()] });
  const second = h.addFile({ name: "chosen.jpg", parents: [root.getId()] });
  h.controls.pages = [
    { files: [file, h.addFile({ name: "chosen.jpg", parents: [root.getId()], appProperties: {} }), h.addFile({ name: "chosen.jpg", parents: ["other"] })], nextPageToken: "1" },
    { files: [second, h.addFile({ name: "other.jpg", parents: [root.getId()] }), h.addFile({ name: "chosen.jpg", mimeType: folderType, parents: [root.getId()] })] }
  ];
  const files = root.getFilesByName("chosen.jpg");
  assert.equal(files.next().getId(), file.id);
  assert.equal(files.next().getId(), second.id);
  assert.equal(files.hasNext(), false);
  assert.equal(h.calls.list.length, 2);
  assert.equal(h.calls.list[1].pageToken, "1");
  assert.ok(h.calls.list[0].q.includes(`'${root.getId()}' in parents`));
  assert.ok(h.calls.list[0].q.includes("appProperties has"));
});

test("partial or cyclic listings fail instead of returning a destructive partial refresh", () => {
  const h = harness(), root = h.drive.createFolder("Root");
  h.controls.pages = [{ files: [], incompleteSearch: true }];
  assert.throws(() => root.getFiles(), /incomplete/);
  h.controls.pages = [{ files: [], nextPageToken: "1" }, { files: [], nextPageToken: "1" }];
  assert.throws(() => root.getFiles(), /could not be completed/);
});

test("the artist reader accepts photos dropped into its folder without granting managed-archive access", () => {
  const h = harness();
  const artist = h.addFile({ mimeType: folderType, isAppAuthorized: false, appProperties: {} }, []);
  const photo = h.addFile({ name: "dropped.jpg", parents: [artist.id], isAppAuthorized: false, appProperties: {} }, [1, -2, 3]);
  const folder = h.drive.getArtistFolderById(artist.id);
  const files = folder.getFiles();
  assert.equal(files.next().getId(), photo.id);
  assert.equal(files.hasNext(), false);
  const file = h.drive.getArtistFileById(photo.id, artist.id);
  assert.equal(file.getName(), "dropped.jpg");
  assert.deepEqual(file.getBlob().getBytes(), [1, -2, 3]);
  assert.throws(() => h.drive.getFolderById(artist.id), error => error.exposureCode_ === "ACCESS_NOT_GRANTED");
  assert.throws(() => h.drive.getFileById(photo.id), error => error.exposureCode_ === "ACCESS_NOT_GRANTED");
  assert.equal(h.calls.create.length, 0, "reading manually added photos must not copy them into another file");
  assert.equal(h.calls.update.length, 0, "reading does not add app markers or change the user's photos");
});

test("artist inventory fully paginates and filters unrelated files even when the API returns them", () => {
  const h = harness();
  const artist = h.addFile({ mimeType: folderType, isAppAuthorized: false, appProperties: {} }, []);
  const first = h.addFile({ name: "chosen.jpg", parents: [artist.id], isAppAuthorized: false, appProperties: {} });
  const second = h.addFile({ name: "chosen.jpg", mimeType: "image/png", parents: [artist.id], isAppAuthorized: false, appProperties: {} });
  h.controls.pages = [
    { files: [first, h.addFile({ name: "chosen.jpg", parents: ["unrelated"] }), h.addFile({ name: "chosen.jpg", parents: [artist.id], trashed: true })], nextPageToken: "1" },
    { files: [second, h.addFile({ name: "different.jpg", parents: [artist.id] }),
      h.addFile({ name: "chosen.jpg", mimeType: folderType, parents: [artist.id] }),
      h.addFile({ name: "chosen.jpg", mimeType: "application/vnd.google-apps.shortcut", parents: [artist.id], shortcutDetails: { targetId: first.id } }),
      h.addFile({ name: "chosen.jpg", mimeType: "text/plain", parents: [artist.id] })] }
  ];
  const files = h.drive.getArtistFolderById(artist.id).getFilesByName("chosen.jpg");
  assert.equal(files.next().getId(), first.id);
  assert.equal(files.next().getId(), second.id);
  assert.equal(files.hasNext(), false);
  assert.equal(h.calls.list.length, 2);
  assert.equal(h.calls.list[1].pageToken, "1");
  assert.ok(h.calls.list.every(call => call.q.includes(`'${artist.id}' in parents`)));
  assert.equal(h.calls.fetch.length, 0, "listing metadata does not download every photograph");
  assert.ok(h.calls.list.every(call => call.fields.includes("sha256Checksum") && call.fields.includes("version")));
});

test("artist fingerprints use Drive SHA-256 and a verified 64-byte media range", () => {
  const { h, file, photo, bytes } = fingerprintFixture();
  h.controls.range = true;
  h.controls.rangeHeaders = { "content-range": `bytes 0-63/${bytes.length}` };
  const result = clone(file.getScanFingerprint());
  assert.equal(result.sha256, sha256(bytes));
  assert.deepEqual(result.header, bytes.slice(0, 64));
  assert.equal(result.transferredBytes, 64);
  assert.equal(result.fullRead, false);
  assert.equal(h.calls.fetch.length, 1);
  assert.equal(h.calls.fetch[0].url, `https://www.googleapis.com/drive/v3/files/${photo.id}?alt=media`);
  assert.deepEqual(h.calls.fetch[0].options.headers, { Authorization: "Bearer private-test-token", Range: "bytes=0-63" });
  assert.equal(h.calls.fetch[0].options.followRedirects, false);
  assert.equal(h.calls.create.length, 0);
  assert.equal(h.calls.update.length, 0);
});

test("short artist files request only their actual length", () => {
  const { h, file } = fingerprintFixture({}, [255, 216, 255, 4]);
  h.controls.range = true;
  assert.equal(file.getScanFingerprint().header.length, 4);
  assert.equal(h.calls.fetch[0].options.headers.Range, "bytes=0-3");
});

test("missing or invalid Drive checksums and AVIF return to the full-read path without a media probe", () => {
  for (const overrides of [{ sha256Checksum: undefined }, { sha256Checksum: "not-sha256" }, { mimeType: "image/avif" }]) {
    const { h, file } = fingerprintFixture(overrides);
    assert.equal(file.getScanFingerprint(), null);
    assert.equal(h.calls.fetch.length, 0);
  }
});

test("partial artist responses require one exact complete Content-Range and the requested byte count", () => {
  for (const headers of [{}, { "Content-Range": "bytes 1-64/128" }, { "Content-Range": "bytes 0-62/128" },
    { "Content-Range": "bytes 0-63/129" }, { "Content-Range": "bytes 0-63/*" },
    { "Content-Range": ["bytes 0-63/128"] }, { "Content-Range": "bytes 0-63/128", "content-range": "bytes 0-63/128" }]) {
    const { h, file } = fingerprintFixture();
    h.controls.range = true;
    h.controls.rangeHeaders = headers;
    assert.throws(() => file.getScanFingerprint(), error => error.exposureCode_ === "BASE_UNAVAILABLE");
    assert.equal(h.calls.fetch.length, 1);
  }
  const { h, file } = fingerprintFixture();
  h.controls.range = true;
  h.controls.body = [255, 216, 255];
  assert.throws(() => file.getScanFingerprint(), error => error.exposureCode_ === "BASE_UNAVAILABLE");
});

test("an ignored Range response is hashed and reused without a second download", () => {
  const { h, file, bytes } = fingerprintFixture();
  const result = file.getScanFingerprint();
  assert.equal(result.fullRead, true);
  assert.equal(result.transferredBytes, bytes.length);
  assert.equal(result.sha256, sha256(bytes));
  assert.equal(result.header.length, 64);
  assert.equal(h.calls.fetch.length, 1);
  for (const body of [[255, 216, 255], [255, 216, 255, ...Array(125).fill(8)]]) {
    const sample = fingerprintFixture();
    sample.h.controls.body = body;
    assert.throws(() => sample.file.getScanFingerprint(), error => error.exposureCode_ === "BASE_UNAVAILABLE" &&
      error.scanFullRead_ === true && error.scanBytes_ === body.length);
    assert.equal(sample.h.calls.fetch.length, 1);
  }
});

test("artist fingerprint probes reject redirects and media failures", () => {
  for (const status of [302, 401, 403, 404, 429, 500]) {
    const { h, file } = fingerprintFixture();
    h.controls.httpCode = status;
    assert.throws(() => file.getScanFingerprint(), error => error.exposureCode_ === "BASE_UNAVAILABLE" && !error.message.includes("private-test-token"));
    assert.equal(h.calls.fetch[0].options.followRedirects, false);
  }
  const { h, file } = fingerprintFixture();
  h.controls.httpCode = 503;
  h.controls.body = Array(1024).fill(1);
  assert.throws(() => file.getScanFingerprint(), error => error.scanFullRead_ === true && error.scanBytes_ === 1024);
  assert.equal(h.calls.fetch.length, 1, "even a rejected buffered error body is charged without another fetch");
});

test("artist fingerprints reject all content or access changes around the probe", () => {
  for (const change of [
    file => { file.sha256Checksum = "a".repeat(64); },
    file => { file.size = "129"; },
    file => { file.mimeType = "image/png"; },
    file => { file.modifiedTime = "2026-10-30T01:00:01Z"; },
    file => { file.version = "9007199254740993"; },
    file => { file.parents.push("another-parent"); },
    file => { file.parents = ["another-folder"]; },
    file => { file.trashed = true; },
    file => { file.capabilities.canDownload = false; }
  ]) {
    const { h, file, photo } = fingerprintFixture();
    h.controls.range = true;
    h.controls.onFetch = () => change(h.files.get(photo.id).metadata);
    assert.throws(() => file.getScanFingerprint(), error => error.exposureCode_ === "BASE_UNAVAILABLE");
  }
  const { h, file, photo } = fingerprintFixture();
  h.files.get(photo.id).metadata.sha256Checksum = "b".repeat(64);
  assert.throws(() => file.getScanFingerprint(), error => error.exposureCode_ === "BASE_UNAVAILABLE");
  assert.equal(h.calls.fetch.length, 0, "changed listing metadata cannot be used for a probe");
});

test("artist folders and files reject invalid IDs, wrong parents, unsupported types and deleted content", () => {
  const h = harness();
  const artist = h.addFile({ mimeType: folderType, isAppAuthorized: false, appProperties: {} }, []);
  const image = h.addFile({ parents: [artist.id], isAppAuthorized: false, appProperties: {} });
  const trashedFolder = h.addFile({ mimeType: folderType, trashed: true });
  for (const id of [image.id, trashedFolder.id, "missing", "https://example.test/folder", "../folder", "folder\nother", 8]) {
    assert.throws(() => h.drive.getArtistFolderById(id));
  }
  for (const overrides of [{ parents: ["unrelated"] }, { mimeType: folderType },
    { mimeType: "application/vnd.google-apps.shortcut" }, { mimeType: "text/plain" }, { trashed: true },
    { size: "unknown" }, { size: "0" }, { size: String(30 * 1024 * 1024 + 1) }, { capabilities: { canDownload: false } }]) {
    const file = h.addFile({ parents: [artist.id], isAppAuthorized: false, appProperties: {}, ...overrides });
    assert.throws(() => h.drive.getArtistFileById(file.id, artist.id).getBlob());
  }
  for (const id of ["https://example.test/image", "../image", "image?alt=media", 9]) {
    assert.throws(() => h.drive.getArtistFileById(id, artist.id));
  }
  assert.equal(h.calls.fetch.length, 0);
});

test("artist wrappers cannot create, move or mark files despite broader read permission", () => {
  const h = harness();
  const artist = h.addFile({ mimeType: folderType, isAppAuthorized: false, appProperties: {} }, []);
  const photo = h.addFile({ parents: [artist.id], isAppAuthorized: false, appProperties: {} });
  const folder = h.drive.getArtistFolderById(artist.id);
  const file = h.drive.getArtistFileById(photo.id, artist.id);
  for (const item of [folder, file]) {
    assert.throws(() => item.createFolder("another"), error => error.exposureCode_ === "READ_ONLY_SOURCE");
    assert.throws(() => item.createFile(new h.Blob([1], "image/jpeg", "another.jpg")), error => error.exposureCode_ === "READ_ONLY_SOURCE");
    assert.throws(() => item.moveTo({ getId: () => artist.id }), error => error.exposureCode_ === "READ_ONLY_SOURCE");
  }
  assert.equal(h.calls.create.length, 0);
  assert.equal(h.calls.update.length, 0);
});

test("artist downloads check current folder membership before and after the media request", () => {
  const h = harness();
  const artist = h.addFile({ mimeType: folderType, isAppAuthorized: false, appProperties: {} }, []);
  const photo = h.addFile({ parents: [artist.id], isAppAuthorized: false, appProperties: {} });
  const file = h.drive.getArtistFileById(photo.id, artist.id);
  h.files.get(photo.id).metadata.parents = ["moved-out"];
  assert.throws(() => file.getBlob());
  assert.equal(h.calls.fetch.length, 0, "a stale wrapper cannot download a file moved outside the artist folder");
  h.files.get(photo.id).metadata.parents = [artist.id];
  h.controls.onFetch = id => { h.files.get(id).metadata.parents = ["moved-during-download"]; };
  assert.throws(() => file.getBlob());
  assert.equal(h.calls.fetch.length, 1, "bytes are rejected if membership changes during the download");
});

test("artist downloads retain fixed endpoints and reject redirects and partial listings", () => {
  const h = harness();
  const artist = h.addFile({ mimeType: folderType, isAppAuthorized: false, appProperties: {} }, []);
  const photo = h.addFile({ parents: [artist.id], isAppAuthorized: false, appProperties: {} });
  h.controls.httpCode = 302;
  assert.throws(() => h.drive.getArtistFileById(photo.id, artist.id).getBlob(), error => !error.message.includes("private-test-token"));
  assert.equal(h.calls.fetch[0].url, `https://www.googleapis.com/drive/v3/files/${photo.id}?alt=media`);
  assert.equal(h.calls.fetch[0].options.followRedirects, false);
  h.controls.pages = [{ files: [photo], incompleteSearch: true }];
  assert.throws(() => h.drive.getArtistFolderById(artist.id).getFiles(), /incomplete/);
  h.controls.pages = [{ files: [photo], nextPageToken: "1" }, { files: [], nextPageToken: "1" }];
  assert.throws(() => h.drive.getArtistFolderById(artist.id).getFiles(), /could not be completed/);
});

test("image downloads use the documented fixed media endpoint, private OAuth token and no redirects", () => {
  const h = harness(), file = h.addFile({ name: "artist.jpg" }, [1, -2, 3]);
  const blob = h.drive.getFileById(file.id).getBlob();
  assert.deepEqual(blob.getBytes(), [1, -2, 3]);
  assert.equal(blob.getName(), "artist.jpg");
  assert.equal(blob.getContentType(), "image/jpeg");
  assert.deepEqual(h.calls.fetch, [{ url: `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, options: {
    method: "get", headers: { Authorization: "Bearer private-test-token" }, followRedirects: false, muteHttpExceptions: true
  } }]);
  assert.equal(JSON.stringify(blob).includes("private-test-token"), false);
});

test("downloads fail safely on nonimages, unknown size, oversized files, denied content and changed length", () => {
  const h = harness();
  for (const override of [{ mimeType: "text/plain" }, { size: "not-known" }, { size: "0" }, { size: String(30 * 1024 * 1024 + 1) }, { capabilities: {} }]) {
    const file = h.addFile(override);
    assert.throws(() => h.drive.getFileById(file.id).getBlob(), /cannot be downloaded/);
  }
  assert.equal(h.calls.fetch.length, 0);
  const file = h.addFile();
  for (const status of [302, 401, 403, 404, 500]) {
    h.controls.httpCode = status;
    assert.throws(() => h.drive.getFileById(file.id).getBlob(), error => !error.message.includes("private-test-token") && /could not be downloaded/.test(error.message));
  }
  h.controls.httpCode = 200;
  h.controls.body = [1];
  assert.throws(() => h.drive.getFileById(file.id).getBlob(), /changed while it was being read/);
});

test("metadata caches are reset between executions so revoked access is not retained", () => {
  const h = harness(), file = h.addFile();
  h.drive.getFileById(file.id).getName();
  h.drive.getFileById(file.id).getSize();
  assert.equal(h.calls.get.length, 1);
  h.files.get(file.id).metadata.isAppAuthorized = false;
  h.drive.reset();
  assert.throws(() => h.drive.getFileById(file.id), /limited-access/);
  assert.equal(h.calls.get.length, 2);
});

test("new spreadsheets are tagged before normal access, and moves target only authorized project folders", () => {
  const h = harness();
  const spreadsheet = h.sheets.create("Index");
  assert.deepEqual(h.calls.update[0].resource, { appProperties: { exposureArchive: "drive-file-v1" } });
  const root = h.drive.createFolder("Project");
  h.drive.getFileById(spreadsheet.getId()).moveTo(root);
  assert.deepEqual(h.files.get(spreadsheet.getId()).metadata.parents, [root.getId()]);
  const writes = h.calls.update.length;
  h.drive.getFileById(spreadsheet.getId()).moveTo(root);
  assert.equal(h.calls.update.length, writes, "moving an already placed file is a no-op");
  const unrelated = h.addFile({ mimeType: folderType, appProperties: {} });
  assert.throws(() => h.drive.getFileById(spreadsheet.getId()).moveTo({ getId: () => unrelated.id }), /limited-access/);
});

test("Sheets values stay literal with RAW writes, quoted names, rectangular padding and synchronous caches", () => {
  const h = harness(), book = h.sheets.create("Index");
  assert.equal(book.getSheetByName("Sources"), null);
  const sheet = book.insertSheet("Artist's Sources");
  assert.equal(sheet.getLastRow(), 0);
  sheet.getRange(1, 1, 1, 3).setValues([["=IMPORTXML(\"url\")", "2026-10-30", true]]);
  assert.deepEqual(Array.from(sheet.getRange(1, 1, 2, 4).getValues(), line => Array.from(line)), [["=IMPORTXML(\"url\")", "2026-10-30", true, ""], ["", "", "", ""]]);
  assert.equal(sheet.getLastRow(), 1);
  assert.equal(sheet.getLastColumn(), 3);
  assert.equal(h.calls.valuesUpdate[0].range, "'Artist''s Sources'!A1:C1");
  assert.equal(h.calls.valuesUpdate[0].options.valueInputOption, "RAW");
  assert.equal(h.calls.valuesGet.filter(call => call.range === "'Artist''s Sources'").length, 1);
  const literalRange = sheet.getRange(2, 1);
  assert.equal(literalRange.setNumberFormat("@"), literalRange);
  assert.throws(() => literalRange.setNumberFormat("0.00"), /Only literal archive text/);
});

test("Sheet writes grow the actual grid, reject malformed ranges and preserve cache on failed writes", () => {
  const h = harness(), book = h.sheets.create("Index"), sheet = book.getSheetByName("Sheet1");
  sheet.getRange(1, 1, 1, 3).setValues([["one", "two", "three"]]);
  h.controls.failValueWrite = true;
  assert.throws(() => sheet.getRange(2, 1).setValues([["not-saved"]]), /Temporary write failure/);
  assert.equal(sheet.getLastRow(), 1);
  assert.deepEqual(Array.from(sheet.getRange(2, 1).getValues()[0]), [""]);
  sheet.getRange(4, 28).setValues([["last"]]);
  assert.equal(h.calls.valuesUpdate.at(-1).range, "'Sheet1'!AB4:AB4");
  assert.equal(sheet.getLastRow(), 4);
  assert.equal(sheet.getLastColumn(), 28);
  assert.deepEqual(h.books.get(book.getId()).sheets[0].properties.gridProperties, { rowCount: 4, columnCount: 28 });
  for (const args of [[0,1], [1,-1], [1,1,0,1], [1,1,1,NaN]]) assert.throws(() => sheet.getRange(...args), /range is invalid/);
  for (const data of [[], [[1,2]], [[null]], [[{}]], [[Infinity]]]) assert.throws(() => sheet.getRange(1,1).setValues(data), /row data is invalid/);
});

test("Sheets cache reset reads current external values and denies unrelated spreadsheets", () => {
  const h = harness(), book = h.sheets.create("Index"), sheet = book.getSheetByName("Sheet1");
  sheet.getRange(1, 1).setValues([["before"]]);
  h.books.get(book.getId()).values.Sheet1[0][0] = "after";
  h.sheets.reset();
  assert.deepEqual(Array.from(h.sheets.openById(book.getId()).getSheetByName("Sheet1").getRange(1, 1).getValues()[0]), ["after"]);
  const unrelated = h.addFile({ mimeType: sheetType, appProperties: {} });
  const gets = h.calls.sheets.length;
  assert.throws(() => h.sheets.openById(unrelated.id), /limited-access/);
  assert.equal(h.calls.sheets.length, gets);
});

test("the real backend archives through the limited adapters with consent, original deduplication and unique usage reservations", () => {
  const h = backendHarness();
  const links = h.sandbox.setupProject();
  const setupIds = [...h.properties.entries()].filter(([key]) => key.startsWith("EXPOSURE_") && key.endsWith("_ID"));
  const initialFiles = h.files.size;
  h.sandbox.setupProject();
  assert.equal(h.files.size, initialFiles, "rerunning setup must reuse app-created folders and index");
  assert.deepEqual([...h.properties.entries()].filter(([key]) => key.startsWith("EXPOSURE_") && key.endsWith("_ID")), setupIds);
  assert.ok(links.sheet.includes(h.properties.get("EXPOSURE_SPREADSHEET_ID")));

  const imported = h.artist("import", { image: image(1, "artist.jpg") });
  assert.equal(imported.imported, true);
  assert.equal(imported.artistCount, 1);
  assert.equal(h.artist("import", { image: image(1, "renamed-identical.jpg") }).duplicate, true);
  assert.equal(h.api("bootstrap").totalEligible, 1);

  const settings = { baseExposure: 0, participantExposure: 0, contrast: 12, monochrome: true };
  const firstId = crypto.randomUUID();
  const first = h.api("begin", { submissionId: firstId, original: image(2), allowReuse: false });
  assert.equal(h.records("Sources").find(source => source.kind === "participant").eligible, false);
  const firstResult = { submissionId: firstId, token: first.token, result: image(3), width: 720, height: 480, settings };
  const completedFirst = h.api("complete", firstResult);
  assert.equal(completedFirst.saved, true);
  assert.equal(h.api("bootstrap").participantCount, 0, "an unconsented original stays outside future pairings");

  const secondId = crypto.randomUUID();
  const second = h.api("begin", { submissionId: secondId, original: image(2, "same-photo-again.jpg"), allowReuse: true });
  assert.equal(second.originalId, first.originalId, "byte-identical uploads must reuse the same original file");
  assert.equal(h.api("bootstrap").participantCount, 0, "opt-in does not become eligible before a saved result");
  h.api("complete", { submissionId: secondId, token: second.token, result: image(4), width: 720, height: 480, settings });
  const sourcePool = h.api("bootstrap");
  assert.equal(sourcePool.artistCount, 1);
  assert.equal(sourcePool.participantCount, 1);
  assert.equal(sourcePool.totalEligible, 2);

  const originals = [...h.files.values()].filter(file => file.metadata.parents.includes(h.properties.get("EXPOSURE_ORIGINALS_FOLDER_ID")));
  const results = [...h.files.values()].filter(file => file.metadata.parents.includes(h.properties.get("EXPOSURE_RESULTS_FOLDER_ID")));
  assert.equal(originals.length, 0, "a completed opt-in moves the original out of private-only intake");
  assert.equal(results.length, 2);
  const promoted = h.files.get(first.originalId);
  assert.deepEqual(Array.from(promoted.metadata.parents), [h.properties.get("EXPOSURE_ARTIST_FOLDER_ID")]);
  assert.match(promoted.metadata.name, /^participant_photo_[1-9]\d*\.jpg$/);
  assert.equal(promoted.metadata.appProperties.exposureRole, "participant");
  assert.deepEqual(Buffer.from(promoted.bytes), Buffer.from(image(2).base64, "base64"), "moving and identifying the original preserves exact bytes");
  assert.deepEqual(h.records("Submissions").map(row => [row.status, row.allowReuse]), [["complete", false], ["complete", true]]);

  const usage = h.records("Usage");
  assert.equal(usage.length, 5, "two submissions, one original and two result reservations");
  assert.equal(new Set(usage.map(row => row.key)).size, usage.length);
  assert.equal(usage.filter(row => row.kind === "submission").length, 2);
  assert.equal(usage.filter(row => row.kind === "file").reduce((sum, row) => sum + row.bytes, 0), 27);

  h.api("complete", firstResult);
  assert.equal(h.records("Usage").length, 5, "a completed save retry must not charge a second reservation");
  assert.equal([...h.files.values()].filter(file => file.metadata.parents.includes(h.properties.get("EXPOSURE_RESULTS_FOLDER_ID"))).length, 2);
  assert.equal(h.api("bootstrap").participantCount, 1, "retrying an earlier opt-out result cannot revoke a later opt-in");
  assert.ok(h.calls.valuesUpdate.every(call => call.options.valueInputOption === "RAW"));
  assert.ok(h.calls.fetch.every(call => call.options.followRedirects === false));
});

test("the real backend discovers a Drive-dropped photo and pairs it without an artist import or extra copy", () => {
  const h = backendHarness();
  h.sandbox.setupProject();
  const artistFolderId = h.properties.get("EXPOSURE_ARTIST_FOLDER_ID");
  const original = image(31, "dropped-directly-in-Drive.jpg");
  const photo = h.addFile({ name: original.name, parents: [artistFolderId], isAppAuthorized: false, appProperties: {} },
    Buffer.from(original.base64, "base64"));
  const untouchedMetadata = clone(photo);
  const createsBeforeScan = h.calls.create.length;
  const updatesBeforeScan = h.calls.update.length;

  const collection = h.api("bootstrap");
  assert.equal(collection.artistCount, 1);
  assert.equal(collection.totalEligible, 1);
  assert.equal(h.calls.create.length, createsBeforeScan, "discovery indexes the existing Drive photo instead of importing another copy");
  const source = h.records("Sources").find(source => source.kind === "artist");
  assert.equal(source.sourceId, photo.id);
  assert.equal(source.nameJson, JSON.stringify(original.name));
  assert.equal(source.eligible, true);
  assert.equal(source.modifiedAt, new Date(photo.modifiedTime).toISOString());

  const paired = h.api("begin", { submissionId: crypto.randomUUID(), original: image(32), allowReuse: false });
  assert.equal(paired.base.id, photo.id);
  assert.equal(paired.base.name, original.name);
  assert.equal(paired.base.base64, original.base64);
  assert.equal(h.records("Submissions")[0].baseSha256, source.sha256, "the selected base content is pinned for retries");
  assert.deepEqual(h.files.get(photo.id).metadata, untouchedMetadata, "the user-managed photo is never renamed, marked or moved");
  assert.equal(h.calls.update.length, updatesBeforeScan);
  assert.equal([...h.files.values()].filter(file => file.metadata.parents.includes(artistFolderId)).length, 1);
});

test("real checksum-backed intake uses header probes but fully hashes the chosen photograph", () => {
  const h = backendHarness(); h.sandbox.setupProject();
  const folder = h.properties.get("EXPOSURE_ARTIST_FOLDER_ID");
  h.controls.range = true;
  const bytes = Buffer.from([255, 216, 255, ...Array(125).fill(7)]);
  const photo = h.addFile({ parents: [folder], sha256Checksum: sha256(bytes), version: "1" }, bytes);
  assert.equal(h.api("bootstrap").artistCount, 1);
  assert.equal(h.calls.fetch.length, 1);
  assert.equal(h.calls.fetch[0].options.headers.Range, "bytes=0-63");
  assert.equal(h.records("Sources")[0].sha256, sha256(bytes));
  const paired = h.api("begin", { submissionId: crypto.randomUUID(), original: image(99) });
  assert.equal(paired.base.id, photo.id);
  assert.equal(Buffer.from(paired.base.base64, "base64").equals(bytes), true);
  assert.equal(h.calls.fetch.length, 2);
  assert.equal(h.calls.fetch[1].options.headers.Range, undefined, "the chosen source still requires all bytes and SHA-256 verification");
});

test("a chosen base with stale Drive checksum metadata still fails full-byte SHA verification", () => {
  const h = backendHarness(); h.sandbox.setupProject();
  const folder = h.properties.get("EXPOSURE_ARTIST_FOLDER_ID");
  h.controls.range = true;
  const bytes = [255, 216, 255, ...Array(125).fill(7)];
  const photo = h.addFile({ parents: [folder], sha256Checksum: sha256(bytes) }, bytes);
  assert.equal(h.api("bootstrap").artistCount, 1);
  h.files.get(photo.id).bytes[100] = 8;
  const response = clone(h.sandbox.exposureApi({ action: "begin", payload: { submissionId: crypto.randomUUID(), original: image(99) } }));
  assert.equal(response.error.code, "BASE_UNAVAILABLE");
  assert.equal(h.calls.fetch.at(-1).options.headers.Range, undefined);
  assert.equal(h.records("Submissions")[0].baseId, "");
});

test("real intake validates JPEG, PNG and WebP signatures without full-file downloads", () => {
  const h = backendHarness(); h.sandbox.setupProject();
  const folder = h.properties.get("EXPOSURE_ARTIST_FOLDER_ID");
  h.controls.range = true;
  for (const [mimeType, prefix] of [["image/jpeg", [255, 216, 255]],
    ["image/png", [137, 80, 78, 71, 13, 10, 26, 10]], ["image/webp", [...Buffer.from("RIFF1234WEBP")]]]) {
    const bytes = [...prefix, ...Array(128).fill(0)];
    h.addFile({ parents: [folder], mimeType, sha256Checksum: sha256(bytes) }, bytes);
  }
  assert.equal(h.api("bootstrap").artistCount, 3);
  assert.equal(h.calls.fetch.length, 3);
  assert.ok(h.calls.fetch.every(call => call.options.headers.Range === "bytes=0-63"));
});

test("real AVIF intake with a long ftyp box and missing checksums retain full validation", () => {
  const h = backendHarness(); h.sandbox.setupProject();
  const folder = h.properties.get("EXPOSURE_ARTIST_FOLDER_ID");
  h.controls.range = true;
  const avif = Buffer.alloc(128);
  avif.writeUInt32BE(96, 0); avif.write("ftyp", 4); avif.write("isom", 8); avif.write("avif", 80);
  h.addFile({ parents: [folder], mimeType: "image/avif", sha256Checksum: sha256(avif) }, avif);
  h.addFile({ parents: [folder] }, Buffer.from(image(41).base64, "base64"));
  h.addFile({ parents: [folder], sha256Checksum: "invalid" }, Buffer.from(image(42).base64, "base64"));
  assert.equal(h.api("bootstrap").artistCount, 3);
  assert.equal(h.calls.fetch.length, 3);
  assert.ok(h.calls.fetch.every(call => call.options.headers.Range === undefined));
});

test("real ignored Range intake verifies one full response and caches it without downloading twice", () => {
  const h = backendHarness(); h.sandbox.setupProject();
  const folder = h.properties.get("EXPOSURE_ARTIST_FOLDER_ID");
  const bytes = Buffer.from(image(43).base64, "base64");
  h.addFile({ parents: [folder], sha256Checksum: sha256(bytes) }, bytes);
  assert.equal(h.api("bootstrap").artistCount, 1);
  assert.equal(h.calls.fetch.length, 1);
  h.sandbox.refreshArtistCollection();
  assert.equal(h.calls.fetch.length, 1, "the same cached identity does not trigger another download");
});

test("real failed probes block new originals and mismatched image signatures never enter the pool", () => {
  const h = backendHarness(); h.sandbox.setupProject();
  const folder = h.properties.get("EXPOSURE_ARTIST_FOLDER_ID");
  const bytes = Buffer.from(image(44).base64, "base64");
  const photo = h.addFile({ parents: [folder], sha256Checksum: sha256(bytes) }, bytes);
  h.controls.range = true; h.controls.rangeHeaders = {};
  const creates = h.calls.create.length;
  const response = clone(h.sandbox.exposureApi({ action: "begin", payload: { submissionId: crypto.randomUUID(), original: image(99) } }));
  assert.equal(response.error.code, "COLLECTION_REFRESHING");
  assert.equal(h.calls.create.length, creates);
  assert.equal(h.records("Sources").length, 0);
  h.controls.rangeHeaders = null;
  h.files.get(photo.id).metadata.mimeType = "image/png";
  const scan = clone(h.sandbox.refreshArtistCollection());
  assert.equal(scan.artistCount, 0);
  assert.equal(scan.complete, true);
  assert.equal(scan.issues[0].reasonCode, "CONTENT_TYPE_MISMATCH");
});

test("real Drive checksum changes invalidate unchanged-size/time cache and preserve old pairing pins", () => {
  const h = backendHarness(); h.sandbox.setupProject();
  const folder = h.properties.get("EXPOSURE_ARTIST_FOLDER_ID");
  const bytes = Buffer.from(image(45).base64, "base64");
  const photo = h.addFile({ parents: [folder], sha256Checksum: sha256(bytes) }, bytes);
  h.controls.range = true;
  const submitted = { submissionId: crypto.randomUUID(), original: image(99) };
  h.api("begin", submitted);
  const pinned = h.records("Submissions")[0].baseSha256;
  const replacement = [...Buffer.from(image(46).base64, "base64")];
  h.files.get(photo.id).bytes = replacement;
  h.files.get(photo.id).metadata.sha256Checksum = sha256(replacement);
  h.sandbox.refreshArtistCollection();
  assert.notEqual(h.records("Sources")[0].sha256, pinned);
  const response = clone(h.sandbox.exposureApi({ action: "begin", payload: submitted }));
  assert.equal(response.error.code, "BASE_UNAVAILABLE");
  assert.equal(h.records("Submissions")[0].baseSha256, pinned);
});

test("the real owner RPC denies anonymous and other-account calls before reaching the limited adapters", () => {
  const h = backendHarness();
  h.sandbox.setupProject();
  const before = JSON.stringify(Object.fromEntries(Object.entries(h.calls).map(([name, calls]) => [name, calls.length])));
  for (const active of ["", "other@example.test"]) {
    h.identity.active = active;
    for (const action of ["status", "import", "refresh"]) {
      const response = h.sandbox.artistApi({ action, payload: { image: image(9), email: "owner@example.test" } });
      assert.equal(response.ok, false);
      assert.equal(response.error.code, "OWNER_REQUIRED");
    }
    assert.throws(() => h.sandbox.setupProject(), error => error.exposureCode_ === "OWNER_REQUIRED");
  }
  assert.equal(JSON.stringify(Object.fromEntries(Object.entries(h.calls).map(([name, calls]) => [name, calls.length]))), before);
});

test("participant provenance and numbered name are written atomically only on managed image files", () => {
  const h = harness();
  const root = h.drive.createFolder("Project");
  const originals = root.createFolder("participant_uploads");
  const artist = root.createFolder("My_photos");
  const image = originals.createFile(new h.Blob([1, -2, 3], "image/jpeg", "source.jpg"));
  const before = h.calls.update.length;
  image.markParticipantPhoto("participant_photo_1.jpg");
  assert.equal(h.calls.update.length, before + 1);
  const write = h.calls.update.at(-1);
  assert.equal(write.resource.name, "participant_photo_1.jpg");
  assert.equal(write.resource.appProperties.exposureRole, "participant");
  assert.equal(h.files.get(image.getId()).metadata.appProperties.exposureArchive, "drive-file-v1");
  assert.equal(image.isParticipantPhoto(), true);
  image.moveTo(artist);
  assert.deepEqual(Array.from(h.files.get(image.getId()).metadata.parents), [artist.getId()]);
  assert.equal(h.drive.getArtistFileById(image.getId(), artist.getId()).isParticipantPhoto(), true);
  assert.equal(h.calls.create.filter(call => call.resource.mimeType === "image/jpeg").length, 1, "classification and movement do not copy image bytes");
});

test("participant marker writes cannot broaden read-only source access", () => {
  const h = harness();
  const artist = h.addFile({ mimeType: folderType, isAppAuthorized: false, appProperties: {} }, []);
  const image = h.addFile({ parents: [artist.id], isAppAuthorized: false, appProperties: {} });
  const source = h.drive.getArtistFileById(image.id, artist.id);
  assert.equal(source.isParticipantPhoto(), false);
  assert.throws(() => source.markParticipantPhoto("participant_photo_1.jpg"));
  assert.equal(h.calls.update.length, 0);
  assert.equal(h.files.get(image.id).metadata.name, "image.jpg");
});

test("the real adapters deduplicate existing Drive bases and repeated composite bytes across new submissions", () => {
  const h = backendHarness();
  h.sandbox.setupProject();
  const artistFolderId = h.properties.get("EXPOSURE_ARTIST_FOLDER_ID");
  const dropped = image(31, "artist-original.jpg");
  const source = h.addFile({ name: dropped.name, parents: [artistFolderId], isAppAuthorized: false, appProperties: {} }, Buffer.from(dropped.base64, "base64"));
  h.artist("import", { image: image(32) });
  const settings = { baseExposure: 0, participantExposure: 0, contrast: 12, monochrome: true };
  const receipts = [];
  for (const number of [1, 2]) {
    const begun = h.api("begin", { submissionId: crypto.randomUUID(), original: image(31, `test-copy-${number}.jpg`), allowReuse: true });
    assert.equal(begun.originalId, source.id);
    receipts.push(h.api("complete", { submissionId: begun.submissionId, token: begun.token, result: image(40), width: 720, height: 480, settings }));
  }
  assert.equal(receipts[0].resultId, receipts[1].resultId);
  const originals = [...h.files.values()].filter(file => file.metadata.parents.includes(h.properties.get("EXPOSURE_ORIGINALS_FOLDER_ID")));
  const results = [...h.files.values()].filter(file => file.metadata.parents.includes(h.properties.get("EXPOSURE_RESULTS_FOLDER_ID")));
  assert.equal(originals.length, 0);
  assert.equal(results.length, 1);
  assert.equal(h.files.get(source.id).metadata.name, "artist-original.jpg");
  assert.deepEqual(h.files.get(source.id).metadata.appProperties, {}, "an artist's dropped original is not reclassified or modified");
});
