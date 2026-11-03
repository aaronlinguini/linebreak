"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { googleClientSource, buildGoogleClient } = require("../scripts/build-google-client.cjs");

const project = path.resolve(__dirname, "..");
const protocol = "double-exposure-archive-v1";
const endpoint = "https://script.google.com/macros/s/deployment-example/exec";
const bootstrap = { totalEligible: 1, artistCount: 1, participantCount: 0, includeParticipantPhotos: true, maxOriginalBytes: 30 * 1024 * 1024, maxResultBytes: 12 * 1024 * 1024 };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const plain = (value) => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
};
const websiteBridgeSource = fs.readFileSync(path.join(project, "drive-bridge.js"), "utf8");

function googleBridgeSource() {
  const sandbox = vm.createContext({
    ContentService: {
      MimeType: { JAVASCRIPT: "JAVASCRIPT" },
      createTextOutput: (content) => ({ getContent: () => content, setMimeType(type) { this.mimeType = type; return this; } })
    }
  });
  for (const name of ["Code.gs", "Client.gs"]) {
    vm.runInContext(fs.readFileSync(path.join(project, "google-apps-script", name), "utf8"), sandbox, { timeout: 1000 });
  }
  const output = sandbox.doGet({ parameter: { asset: "bridge" } });
  assert.equal(output.mimeType, "JAVASCRIPT");
  return output.getContent();
}

function makeTransport(options = {}) {
  const listeners = new Set();
  const iframes = [];
  const messages = [];
  const settings = { autoReply: true, ...options };
  const window = {
    location: { origin: "https://artist.example", href: "https://artist.example/exposures/" },
    addEventListener(type, listener) { if (type === "message") listeners.add(listener); },
    removeEventListener(type, listener) { if (type === "message") listeners.delete(listener); },
    crypto: crypto.webcrypto,
    setTimeout, clearTimeout
  };
  window.top = window;
  const document = {
    body: { appendChild(iframe) { iframes.push(iframe); iframe.parentNode = this; return iframe; }, append(iframe) { return this.appendChild(iframe); }, removeChild(iframe) { iframe.removed = true; } },
    createElement(tag) {
      assert.equal(tag, "iframe");
      return {
        src: "", contentWindow: {},
        setAttribute(key, value) { this[key] = value; },
        remove() { this.removed = true; }
      };
    }
  };
  class Reader {
    readAsDataURL(blob) {
      const bytes = blob.bytes || Buffer.alloc(0);
      this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString("base64")}`;
      queueMicrotask(() => { this.onload?.({ target: this }); this.onloadend?.({ target: this }); });
    }
  }
  const emit = (data, origin = "https://script.googleusercontent.com", source = remote) => {
    for (const listener of [...listeners]) listener({ data, origin, source });
  };
  const remote = {
    postMessage(message, targetOrigin) {
      if (settings.failSendOnce && message.request?.action === "complete") {
        settings.failSendOnce = false;
        throw new Error("Simulated closed Google frame");
      }
      messages.push({ message: plain(message), targetOrigin });
      if (settings.autoReply && message.type === "request") {
        const data = message.request.action === "bootstrap" ? bootstrap : { accepted: message.request.payload };
        queueMicrotask(() => emit({ protocol, channel: message.channel, type: "response", id: message.id, response: { ok: true, data } }));
      }
    }
  };
  const sandbox = vm.createContext({ window, document, location: window.location, crypto: crypto.webcrypto, URL, FileReader: Reader, setTimeout, clearTimeout, console });
  const source = fs.readFileSync(path.join(project, "drive-storage.js"), "utf8");
  vm.runInContext(source, sandbox, { timeout: 1000 });
  const storage = new sandbox.GoogleDriveStorage({ googleScriptUrl: endpoint, connectionTimeoutMs: 100, requestTimeoutMs: 100 });
  const channel = () => new URL(iframes.at(-1).src).searchParams.get("channel");
  const ready = (overrides = {}, origin, source) => emit({ protocol, channel: channel(), type: "ready", ...overrides }, origin, source);
  async function connect(options) {
    const promise = storage.connect(options);
    await tick();
    ready();
    return promise;
  }
  return { storage, window, document, sandbox, listeners, iframes, messages, settings, emit, remote, channel, ready, connect };
}

test("bootstrap snapshots and deduplicates exposure history before the Google handshake", async () => {
  const h = makeTransport();
  try {
    const history = ["a".repeat(64), "b".repeat(64), "a".repeat(64)];
    const connection = h.storage.connect({ excludedBaseHashes: history });
    history[0] = "c".repeat(64);
    history.push("d".repeat(64));
    await tick();
    h.ready();
    await connection;
    const request = h.messages.find(({ message }) => message.request?.action === "bootstrap").message.request;
    assert.deepEqual(request.payload, { excludedBaseHashes: ["a".repeat(64), "b".repeat(64)] });
    await h.storage.connect({ excludedBaseHashes: ["c".repeat(64)] });
    const latest = h.messages.filter(({ message }) => message.request?.action === "bootstrap").at(-1).message.request;
    assert.deepEqual(latest.payload, { excludedBaseHashes: ["c".repeat(64)] });
    assert.equal(h.iframes.length, 1, "history refreshes reuse the authenticated healthy frame");
  } finally { h.storage.dispose(); }
});

test("absent and empty history do not add fields to the existing bootstrap, begin or complete payloads", async () => {
  for (const options of [{}, { excludedBaseHashes: [] }]) {
    const h = makeTransport();
    try {
      await h.connect(options);
      await h.storage.begin({ submissionId: "empty-history", originalFile: {
        name: "photo.jpg", type: "image/jpeg", bytes: Buffer.from([255, 216, 255, 217])
      }, ...options });
      await h.storage.complete({ submissionId: "empty-history", token: "token", resultBlob: {
        type: "image/jpeg", bytes: Buffer.from([255, 216, 255, 217])
      }, width: 3, height: 2, ...options });
      for (const { message } of h.messages.filter(({ message }) => message.type === "request")) {
        assert.equal(Object.hasOwn(message.request.payload, "excludedBaseHashes"), false);
      }
    } finally { h.storage.dispose(); }
  }
});

test("fresh originals and completed JPEGs forward frozen history snapshots across asynchronous file reads", async () => {
  const h = makeTransport();
  try {
    await h.connect();
    const read = h.storage._readBase64.bind(h.storage);
    let gate = deferred();
    h.storage._readBase64 = async input => { await gate.promise; return read(input); };
    const originalBytes = Buffer.from([1, 255, 0, 40]);
    const history = ["a".repeat(64), "b".repeat(64), "a".repeat(64)];
    const savingOriginal = h.storage.begin({ submissionId: "history-original", allowReuse: true,
      preferredBaseSha256: "c".repeat(64), excludedBaseHashes: history,
      originalFile: { name: "Original.PNG", type: "image/png", bytes: originalBytes } });
    history[0] = "d".repeat(64);
    history.push("e".repeat(64));
    gate.resolve();
    await savingOriginal;
    const beginPayload = h.messages.find(({ message }) => message.request?.action === "begin").message.request.payload;
    assert.deepEqual(beginPayload.excludedBaseHashes, ["a".repeat(64), "b".repeat(64)]);
    assert.deepEqual(Buffer.from(beginPayload.original.base64, "base64"), originalBytes);
    assert.equal(beginPayload.allowReuse, true);
    assert.equal(beginPayload.preferredBaseSha256, "c".repeat(64));
    gate = deferred();
    const completedBytes = Buffer.from([255, 216, 2, 3, 255, 217]);
    const completeHistory = ["c".repeat(64)];
    const savingResult = h.storage.complete({ submissionId: "history-original", token: "private-token",
      resultBlob: { type: "image/jpeg", bytes: completedBytes }, width: 600, height: 400,
      settings: { monochrome: false }, excludedBaseHashes: completeHistory });
    completeHistory[0] = "f".repeat(64);
    gate.resolve();
    await savingResult;
    const completePayload = h.messages.find(({ message }) => message.request?.action === "complete").message.request.payload;
    assert.deepEqual(completePayload.excludedBaseHashes, ["c".repeat(64)]);
    assert.deepEqual(Buffer.from(completePayload.result.base64, "base64"), completedBytes);
    assert.deepEqual(completePayload.settings, { monochrome: false });
    assert.equal(completePayload.token, "private-token");
  } finally { h.storage.dispose(); }
});

test("authenticated re-pairing and same-base variants include history without transmitting another original", async () => {
  for (const sameBase of [undefined, true]) {
    const h = makeTransport();
    try {
      await h.connect();
      const reuse = { submissionId: "prior-submission", token: "authenticated-parent",
        ...(sameBase === undefined ? {} : { sameBase }) };
      await h.storage.begin({ submissionId: "next-submission", reuse,
        excludedBaseHashes: ["a".repeat(64), "a".repeat(64)] });
      const payload = h.messages.filter(({ message }) => message.request?.action === "begin").at(-1).message.request.payload;
      assert.deepEqual(payload, { submissionId: "next-submission", reuse, excludedBaseHashes: ["a".repeat(64)] });
      for (const key of ["original", "originalFile", "image", "base64", "preferredBaseSha256", "allowReuse"]) {
        assert.equal(Object.hasOwn(payload, key), false);
      }
    } finally { h.storage.dispose(); }
  }
});

test("malformed exposure history rejects before frame creation, file reads or an RPC", async () => {
  const hash = "a".repeat(64);
  const invalid = [null, false, hash, {}, new Set([hash]), [null], ["A".repeat(64)], ["a".repeat(63)],
    ["a".repeat(65)], [new String(hash)], new Array(1), Array(20001).fill(hash)];
  for (const excludedBaseHashes of invalid) {
    for (const action of ["connect", "begin", "complete"]) {
      const h = makeTransport();
      try {
        let reads = 0;
        h.storage._readBase64 = async () => { reads++; return "AA=="; };
        const request = action === "connect" ? { excludedBaseHashes }
          : action === "begin" ? { submissionId: "invalid-history", excludedBaseHashes,
            originalFile: { name: "photo.jpg", type: "image/jpeg", bytes: Buffer.from([255, 216, 255]) } }
          : { submissionId: "invalid-history", token: "token", excludedBaseHashes, width: 1, height: 1,
            resultBlob: { type: "image/jpeg", bytes: Buffer.from([255, 216, 255]) } };
        let promise;
        assert.doesNotThrow(() => { promise = h.storage[action](request); });
        assert.equal(typeof promise?.then, "function");
        await assert.rejects(promise, error => error.code === "INVALID_SUBMISSION");
        assert.equal(h.iframes.length, 0);
        assert.equal(h.messages.length, 0);
        assert.equal(h.listeners.size, 0);
        assert.equal(reads, 0);
      } finally { h.storage.dispose(); }
    }
  }
  const h = makeTransport();
  try {
    await h.connect({ excludedBaseHashes: Array(20000).fill(hash) });
    const request = h.messages.find(({ message }) => message.request?.action === "bootstrap").message.request;
    assert.deepEqual(request.payload.excludedBaseHashes, [hash]);
  } finally { h.storage.dispose(); }
});

test("artist-only bootstrap and result operations preserve the pool choice across awaits and reuse", async () => {
  const h = makeTransport();
  try {
    const connectingChoice = { artistOnly: true, excludedBaseHashes: ["a".repeat(64)] };
    const connection = h.storage.connect(connectingChoice);
    connectingChoice.artistOnly = false;
    await tick();
    h.ready();
    await connection;
    const bootstrapRequest = h.messages.find(({ message }) => message.request?.action === "bootstrap").message.request;
    assert.deepEqual(bootstrapRequest.payload, { artistOnly: true, excludedBaseHashes: ["a".repeat(64)] });
    const originalBytes = Buffer.from([255, 216, 0, 255, 217]);
    const read = h.storage._readBase64.bind(h.storage);
    let gate = deferred();
    let reads = 0;
    h.storage._readBase64 = async input => { reads++; await gate.promise; return read(input); };
    const input = { submissionId: "artist-only", artistOnly: true, allowReuse: false,
      excludedBaseHashes: ["a".repeat(64)], originalFile: { name: "original.jpg", type: "image/jpeg", bytes: originalBytes } };
    const beginning = h.storage.begin(input);
    input.artistOnly = false;
    gate.resolve();
    await beginning;
    const beginRequest = h.messages.filter(({ message }) => message.request?.action === "begin").at(-1).message.request;
    assert.equal(beginRequest.payload.artistOnly, true);
    assert.equal(beginRequest.payload.allowReuse, false, "pool selection must not opt an original into retention");
    assert.deepEqual(beginRequest.payload.excludedBaseHashes, ["a".repeat(64)]);
    assert.deepEqual(Buffer.from(beginRequest.payload.original.base64, "base64"), originalBytes);
    gate = deferred();
    const completion = { submissionId: "artist-only", token: "parent-token", artistOnly: true,
      excludedBaseHashes: ["a".repeat(64)], width: 400, height: 300,
      resultBlob: { type: "image/jpeg", bytes: Buffer.from([255, 216, 10, 255, 217]) } };
    const completing = h.storage.complete(completion);
    completion.artistOnly = false;
    gate.resolve();
    await completing;
    const completeRequest = h.messages.filter(({ message }) => message.request?.action === "complete").at(-1).message.request;
    assert.equal(completeRequest.payload.artistOnly, true);
    assert.deepEqual(completeRequest.payload.excludedBaseHashes, ["a".repeat(64)]);
    assert.equal(reads, 2);
    await h.storage.begin({ submissionId: "artist-variant", artistOnly: true,
      reuse: { submissionId: "artist-only", token: "parent-token", sameBase: true } });
    const variantRequest = h.messages.filter(({ message }) => message.request?.action === "begin").at(-1).message.request;
    assert.deepEqual(variantRequest.payload, { submissionId: "artist-variant", artistOnly: true,
      reuse: { submissionId: "artist-only", token: "parent-token", sameBase: true } });
    assert.equal(reads, 2, "authenticated reuse sends no additional original bytes");
  } finally { h.storage.dispose(); }
});

test("the default mixed pool and explicit false preserve earlier payload shapes and consent", async () => {
  for (const choice of [{}, { artistOnly: false }]) {
    const h = makeTransport();
    try {
      await h.connect(choice);
      await h.storage.begin({ submissionId: "mixed-pool", allowReuse: true, ...choice,
        originalFile: { name: "photo.jpg", type: "image/jpeg", bytes: Buffer.from([255, 216, 255, 217]) } });
      await h.storage.complete({ submissionId: "mixed-pool", token: "token", width: 2, height: 1, ...choice,
        resultBlob: { type: "image/jpeg", bytes: Buffer.from([255, 216, 255, 217]) } });
      for (const { message } of h.messages.filter(({ message }) => message.type === "request")) {
        assert.equal(Object.hasOwn(message.request.payload, "artistOnly"), false);
      }
      const beginRequest = h.messages.find(({ message }) => message.request?.action === "begin").message.request;
      assert.equal(beginRequest.payload.allowReuse, true);
    } finally { h.storage.dispose(); }
  }
});

test("nonboolean artist-only choices reject before any connection, file read or RPC", async () => {
  for (const artistOnly of [null, 0, 1, "true", "false", {}, [], new Boolean(false)]) {
    for (const action of ["connect", "begin", "complete"]) {
      const h = makeTransport();
      try {
        let reads = 0;
        h.storage._readBase64 = async () => { reads++; return "AA=="; };
        const request = action === "connect" ? { artistOnly }
          : action === "begin" ? { submissionId: "invalid-pool", artistOnly,
            originalFile: { name: "photo.jpg", type: "image/jpeg", bytes: Buffer.from([255, 216, 255]) } }
          : { submissionId: "invalid-pool", token: "token", artistOnly, width: 1, height: 1,
            resultBlob: { type: "image/jpeg", bytes: Buffer.from([255, 216, 255]) } };
        let promise;
        assert.doesNotThrow(() => { promise = h.storage[action](request); });
        assert.equal(typeof promise?.then, "function");
        await assert.rejects(promise, error => error.code === "INVALID_SUBMISSION");
        assert.equal(h.iframes.length, 0);
        assert.equal(h.messages.length, 0);
        assert.equal(h.listeners.size, 0);
        assert.equal(reads, 0);
      } finally { h.storage.dispose(); }
    }
  }
});

test("storage connects through an external hidden frame and obtains collection status", async () => {
  const harness = makeTransport();
  assert.equal(harness.storage.configured, true);
  assert.deepEqual(plain(await harness.connect()), bootstrap);
  assert.equal(harness.iframes.length, 1);
  const iframe = harness.iframes[0];
  assert.equal(iframe.hidden, true);
  assert.equal(iframe.className, "storage-bridge");
  assert.equal(new URL(iframe.src).searchParams.get("origin"), "https://artist.example");
  assert.ok(harness.channel().length >= 16);
  assert.ok(harness.messages.some(({ message }) => message.type === "ack"));
  assert.equal(harness.messages.find(({ message }) => message.type === "request").message.request.action, "bootstrap");
  harness.storage.dispose();
});

test("handshake ignores unrelated protocols, channels, and lookalike Google origins", async () => {
  const harness = makeTransport();
  const connection = harness.storage.connect();
  await tick();
  harness.ready({ protocol: "another-protocol" });
  harness.ready({ channel: "incorrect-channel" });
  harness.ready({}, "https://script.googleusercontent.com.attacker.example");
  harness.ready({}, "http://script.googleusercontent.com");
  harness.ready({}, "https://attacker.example");
  assert.equal(harness.messages.length, 0);
  harness.ready();
  await connection;
  harness.storage.dispose();
});

test("the bound frame source and exact Google origin are required for all responses", async () => {
  const harness = makeTransport(); await harness.connect(); harness.settings.autoReply = false;
  const request = harness.storage.complete({ submissionId: "submission-1", token: "token", resultBlob: { bytes: Buffer.from([1, 2, 3]), type: "image/jpeg" }, width: 10, height: 10, settings: {} });
  await tick();
  const outgoing = harness.messages.filter(({ message }) => message.type === "request").at(-1).message;
  let finished = false; request.then(() => { finished = true; });
  const response = { protocol, channel: harness.channel(), type: "response", id: outgoing.id, response: { ok: true, data: { saved: true } } };
  harness.emit(response, "https://script.googleusercontent.com", {});
  harness.emit(response, "https://different.googleusercontent.com", harness.remote);
  harness.emit({ ...response, id: "unrelated-request-id" });
  await tick(); assert.equal(finished, false);
  harness.emit(response);
  assert.deepEqual(plain(await request), { saved: true });
  harness.storage.dispose();
});

test("participant upload transmits the actual original file bytes", async () => {
  const harness = makeTransport(); await harness.connect();
  const bytes = Buffer.from([0, 255, 13, 10, 200, 42]);
  await harness.storage.begin({ submissionId: "submission-1", originalFile: { name: "Original.PNG", type: "image/png", bytes } });
  const outgoing = harness.messages.filter(({ message }) => message.type === "request").at(-1).message.request;
  assert.equal(outgoing.action, "begin");
  assert.equal(outgoing.payload.submissionId, "submission-1");
  assert.equal(outgoing.payload.original.name, "Original.PNG");
  assert.equal(outgoing.payload.original.mimeType, "image/png");
  assert.deepEqual(Buffer.from(outgoing.payload.original.base64, "base64"), bytes);
  assert.equal("preferredBaseSha256" in outgoing.payload, false);
  harness.storage.dispose();
});

test("a preferred artist hash travels at the top level with the untouched original and consent", async () => {
  const harness = makeTransport(); await harness.connect();
  const bytes = Buffer.from([0, 255, 13, 10, 200, 42]);
  const originalFile = Object.freeze({ name: "my photo.PNG", type: "image/png", bytes });
  const preferredBaseSha256 = "0123456789abcdef".repeat(4);
  const readBase64 = harness.storage._readBase64.bind(harness.storage);
  let suppliedFile;
  harness.storage._readBase64 = source => { suppliedFile = source; return readBase64(source); };
  await harness.storage.begin({ submissionId: "preferred-submission", originalFile, allowReuse: true, preferredBaseSha256 });
  const outgoing = harness.messages.filter(({ message }) => message.request?.action === "begin").at(-1).message.request.payload;
  assert.strictEqual(suppliedFile, originalFile);
  assert.deepEqual(outgoing, {
    submissionId: "preferred-submission", allowReuse: true, preferredBaseSha256,
    original: { name: originalFile.name, mimeType: originalFile.type, base64: bytes.toString("base64") }
  });
  assert.deepEqual(originalFile.bytes, bytes);
  assert.equal("reuse" in outgoing, false);
  harness.storage.dispose();
});

test("invalid preferred hashes are rejected before connecting or sending an RPC", async () => {
  const validHash = "a".repeat(64);
  for (const preferredBaseSha256 of [null, "", "not-a-hash", "a".repeat(63), "a".repeat(65), "A".repeat(64),
    123, {}, [], [validHash], new String(validHash)]) {
    const harness = makeTransport();
    await assert.rejects(harness.storage.begin({ submissionId: "submission-1",
      originalFile: { name: "photo.jpg", type: "image/jpeg", bytes: Buffer.from([255, 216, 255]) },
      preferredBaseSha256 }), error => error.code === "INVALID_SUBMISSION");
    assert.equal(harness.iframes.length, 0);
    assert.equal(harness.messages.length, 0);
    assert.equal(harness.listeners.size, 0);
    harness.storage.dispose();
  }
});

test("a preferred hash cannot change an authenticated re-pairing or same-base variant", async () => {
  for (const sameBase of [undefined, true]) {
    const harness = makeTransport();
    const reuse = { submissionId: "previous-submission", token: "private-token",
      ...(sameBase === undefined ? {} : { sameBase }) };
    await assert.rejects(harness.storage.begin({ submissionId: "submission-2", reuse,
      preferredBaseSha256: "b".repeat(64) }), error => error.code === "INVALID_SUBMISSION");
    assert.equal(harness.iframes.length, 0);
    assert.equal(harness.messages.length, 0);
    assert.equal(harness.listeners.size, 0);
    harness.storage.dispose();
  }
});

test("sharing choice travels with the original, while another pairing sends no image bytes", async () => {
  const harness = makeTransport(); await harness.connect();
  const bytes = Buffer.from([255, 216, 255, 217]);
  await harness.storage.begin({ submissionId: "submission-1", originalFile: { name: "photo.jpg", type: "image/jpeg", bytes }, allowReuse: true });
  const first = harness.messages.filter(({ message }) => message.request?.action === "begin").at(-1).message.request.payload;
  assert.equal(first.allowReuse, true);
  assert.deepEqual(Buffer.from(first.original.base64, "base64"), bytes);
  await harness.storage.begin({ submissionId: "submission-2", reuse: { submissionId: "submission-1", token: "private-token" } });
  const next = harness.messages.filter(({ message }) => message.request?.action === "begin").at(-1).message.request.payload;
  assert.deepEqual(next, { submissionId: "submission-2", reuse: { submissionId: "submission-1", token: "private-token" } });
  harness.storage.dispose();
});

test("server refusal rejects an upload and preserves its saved-original flag", async () => {
  const harness = makeTransport(); await harness.connect(); harness.settings.autoReply = false;
  const result = harness.storage.begin({ submissionId: "submission-1", originalFile: { name: "photo.jpg", type: "image/jpeg", bytes: Buffer.from([255, 216, 255]) } });
  await tick();
  const outgoing = harness.messages.filter(({ message }) => message.type === "request").at(-1).message;
  harness.emit({ protocol, channel: harness.channel(), type: "response", id: outgoing.id, response: { ok: false, error: { code: "NO_BASE", message: "No base photograph is available.", originalSaved: true } } });
  await assert.rejects(result, (error) => error.code === "NO_BASE" && error.originalSaved === true);
  harness.storage.dispose();
});

test("a timed-out archive request never reports success or retries it silently", async () => {
  const harness = makeTransport(); await harness.connect(); harness.settings.autoReply = false;
  const promise = harness.storage.complete({ submissionId: "submission-1", token: "token", resultBlob: { bytes: Buffer.from([1, 2]), type: "image/jpeg" }, width: 1, height: 1, settings: {} });
  await assert.rejects(promise, (error) => error.code === "REQUEST_TIMEOUT");
  assert.equal(harness.messages.filter(({ message }) => message.request?.action === "complete").length, 1);
  assert.equal(harness.iframes[0].removed, true);
  assert.equal(harness.listeners.size, 0);
  harness.storage.dispose();
});

test("an explicit retry reopens a stale frame and keeps the same submission and token", async () => {
  const harness = makeTransport(); await harness.connect(); harness.settings.autoReply = false;
  const payload = { submissionId: "same-submission", token: "same-token", resultBlob: { bytes: Buffer.from([1, 2]), type: "image/jpeg" }, width: 1, height: 1, settings: {} };
  await assert.rejects(harness.storage.complete(payload), (error) => error.code === "REQUEST_TIMEOUT");
  assert.equal(harness.iframes.length, 1, "a timeout must not reconnect or replay automatically");
  harness.settings.autoReply = true;
  const retry = harness.storage.complete(payload);
  await tick();
  assert.equal(harness.iframes.length, 2);
  harness.ready(); await retry;
  const requests = harness.messages.filter(({ message }) => message.request?.action === "complete").map(({ message }) => message.request.payload);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1], requests[0]);
  harness.storage.dispose();
});

test("a failed postMessage disconnects the stale frame without reporting a saved result", async () => {
  const harness = makeTransport(); await harness.connect(); harness.settings.failSendOnce = true;
  await assert.rejects(harness.storage.complete({ submissionId: "same-submission", token: "token", resultBlob: { bytes: Buffer.from([1, 2]), type: "image/jpeg" }, width: 1, height: 1, settings: {} }), (error) => error.code === "SEND_FAILED");
  assert.equal(harness.iframes[0].removed, true);
  assert.equal(harness.listeners.size, 0);
  harness.storage.dispose();
});

test("dispose rejects pending requests and removes connection resources", async () => {
  const harness = makeTransport(); await harness.connect(); harness.settings.autoReply = false;
  const promise = harness.storage.complete({ submissionId: "submission-1", token: "token", resultBlob: { bytes: Buffer.from([1, 2]), type: "image/jpeg" }, width: 1, height: 1, settings: {} });
  const rejection = assert.rejects(promise, (error) => error.code === "DISPOSED");
  await tick(); harness.storage.dispose(); await rejection;
  assert.equal(harness.listeners.size, 0);
  assert.equal(harness.iframes[0].removed, true);
});

test("connection timeout cleans up without pretending the collection exists", async () => {
  const harness = makeTransport();
  await assert.rejects(harness.storage.connect(), (error) => error.code === "CONNECTION_TIMEOUT");
  assert.equal(harness.listeners.size, 0);
  assert.equal(harness.iframes[0].removed, true);
});

test("reconnecting a healthy frame refreshes the collection without rebuilding it", async () => {
  const harness = makeTransport(); await harness.connect();
  await harness.storage.connect();
  assert.equal(harness.iframes.length, 1);
  assert.equal(harness.messages.filter(({ message }) => message.request?.action === "bootstrap").length, 2);
  harness.storage.dispose();
});

test("configuration accepts only actual deployed Google Apps Script URLs", async () => {
  for (const url of ["", "http://script.google.com/macros/s/example/exec", "https://script.google.com.attacker.example/macros/s/example/exec", "https://script.google.com/macros/s/example/dev", "https://user:password@script.google.com/macros/s/example/exec"]) {
    const harness = makeTransport();
    const invalid = new harness.sandbox.GoogleDriveStorage({ googleScriptUrl: url });
    assert.equal(invalid.configured, false);
    await assert.rejects(invalid.connect(), (error) => ["INVALID_ENDPOINT", "ARCHIVE_NOT_CONFIGURED"].includes(error.code));
    assert.equal(harness.iframes.length, 0);
    invalid.dispose(); harness.storage.dispose();
  }
});

function makeBridge(source = websiteBridgeSource) {
  const parentOrigin = "https://artist.example";
  const channel = "a".repeat(32);
  const messages = [];
  const calls = [];
  const events = new Map();
  const intervals = new Set();
  const host = { postMessage(message, origin) { messages.push({ message: plain(message), origin }); } };
  const window = {
    top: host,
    addEventListener(type, listener) { events.set(type, listener); },
    removeEventListener(type, listener) { if (events.get(type) === listener) events.delete(type); }
  };
  const sandbox = vm.createContext({
    window, URL,
    document: { querySelector(selector) { return { content: selector.includes("parent-origin") ? parentOrigin : channel }; } },
    google: { script: { run: {
      withSuccessHandler(success) {
        return { withFailureHandler(failure) { return { exposureApi(request) { calls.push({ request: plain(request), success, failure }); } }; } };
      }
    } } },
    setInterval(callback) { intervals.add(callback); return callback; },
    clearInterval(callback) { intervals.delete(callback); }
  });
  vm.runInContext(source, sandbox, { timeout: 1000 });
  const emit = (values, origin = parentOrigin, sender = host) => events.get("message")?.({ data: { protocol, channel, ...values }, origin, source: sender });
  return { messages, calls, events, intervals, host, parentOrigin, channel, emit };
}

test("the Google client is generated deterministically from the website bridge", () => {
  assert.equal(fs.readFileSync(path.join(project, "google-apps-script", "Client.gs"), "utf8"), googleClientSource(websiteBridgeSource));
  assert.doesNotThrow(() => buildGoogleClient({ check: true }));
  assert.throws(() => googleClientSource("console.log('not a bridge');"), /self-contained bridge function/);
  assert.doesNotMatch(googleBridgeSource(), /__[A-Z_]+__|SITE_URL|PRIVATE|<script\b/);
});

for (const [variant, source] of [["website file", websiteBridgeSource], ["Google-served asset", googleBridgeSource()]]) {
test(`${variant}: the bridge requires a valid top-window acknowledgement before invoking RPC`, () => {
  const bridge = makeBridge(source);
  assert.equal(bridge.messages[0].message.type, "ready");
  assert.equal(bridge.messages[0].origin, bridge.parentOrigin);
  const request = { type: "request", id: "request-1", request: { action: "bootstrap", payload: {} } };
  bridge.emit(request);
  assert.equal(bridge.calls.length, 0);
  bridge.emit({ type: "ack" }, "https://attacker.example");
  bridge.emit({ type: "ack" }, bridge.parentOrigin, {});
  bridge.emit({ type: "ack", channel: "wrong-channel" });
  bridge.emit(request);
  assert.equal(bridge.calls.length, 0);
  bridge.emit({ type: "ack" });
  bridge.emit(request);
  assert.equal(bridge.calls.length, 1);
  assert.equal(bridge.intervals.size, 0);
});

test(`${variant}: the bridge limits actions and returns RPC responses to their original request IDs`, () => {
  const bridge = makeBridge(source); bridge.emit({ type: "ack" });
  bridge.emit({ type: "request", id: "forbidden", request: { action: "setupProject_", payload: {} } });
  assert.equal(bridge.calls.length, 0);
  assert.equal(bridge.messages.at(-1).message.response.ok, false);
  bridge.emit({ type: "request", id: "upload-1", request: { action: "begin", payload: { submissionId: "one" } } });
  bridge.emit({ type: "request", id: "upload-1", request: { action: "begin", payload: { submissionId: "one" } } });
  assert.equal(bridge.calls.length, 1, "duplicate RPC request IDs must not execute again");
  bridge.calls[0].success({ ok: true, data: { originalId: "source-one" } });
  const response = bridge.messages.at(-1);
  assert.equal(response.origin, bridge.parentOrigin);
  assert.equal(response.message.id, "upload-1");
  assert.deepEqual(response.message.response, { ok: true, data: { originalId: "source-one" } });
});

test(`${variant}: Google RPC failure produces an error response and never a saved acknowledgement`, () => {
  const bridge = makeBridge(source); bridge.emit({ type: "ack" });
  bridge.emit({ type: "request", id: "save-1", request: { action: "complete", payload: {} } });
  bridge.calls[0].failure(new Error("Temporary Google service error"));
  const response = bridge.messages.at(-1).message;
  assert.equal(response.id, "save-1");
  assert.equal(response.response.ok, false);
  assert.equal(response.response.error.code, "RPC_FAILURE");
  bridge.events.get("pagehide")();
  assert.equal(bridge.events.has("message"), false);
});
}
