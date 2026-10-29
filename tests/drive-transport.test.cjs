"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const project = path.resolve(__dirname, "..");
const protocol = "double-exposure-archive-v1";
const endpoint = "https://script.google.com/macros/s/deployment-example/exec";
const bootstrap = { totalEligible: 1, artistCount: 1, participantCount: 0, includeParticipantPhotos: true, maxOriginalBytes: 30 * 1024 * 1024, maxResultBytes: 12 * 1024 * 1024 };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const plain = (value) => JSON.parse(JSON.stringify(value));

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
  async function connect() {
    const promise = storage.connect();
    await tick();
    ready();
    return promise;
  }
  return { storage, window, document, sandbox, listeners, iframes, messages, settings, emit, remote, channel, ready, connect };
}

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
  harness.storage.dispose();
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

function makeBridge() {
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
  const source = fs.readFileSync(path.join(project, "drive-bridge.js"), "utf8");
  vm.runInContext(source, sandbox, { timeout: 1000 });
  const emit = (values, origin = parentOrigin, sender = host) => events.get("message")?.({ data: { protocol, channel, ...values }, origin, source: sender });
  return { messages, calls, events, intervals, host, parentOrigin, channel, emit };
}

test("the Google bridge requires a valid top-window acknowledgement before invoking RPC", () => {
  const bridge = makeBridge();
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

test("the bridge limits actions and returns RPC responses to their original request IDs", () => {
  const bridge = makeBridge(); bridge.emit({ type: "ack" });
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

test("Google RPC failure produces an error response and never a saved acknowledgement", () => {
  const bridge = makeBridge(); bridge.emit({ type: "ack" });
  bridge.emit({ type: "request", id: "save-1", request: { action: "complete", payload: {} } });
  bridge.calls[0].failure(new Error("Temporary Google service error"));
  const response = bridge.messages.at(-1).message;
  assert.equal(response.id, "save-1");
  assert.equal(response.response.ok, false);
  assert.equal(response.response.error.code, "RPC_FAILURE");
  bridge.events.get("pagehide")();
  assert.equal(bridge.events.has("message"), false);
});
