"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "archive-workflow.js"), "utf8");
const sandbox = { Error };
vm.runInNewContext(`${source}\nthis.Workflow = ExposureArchiveWorkflow;`, sandbox);
const Workflow = sandbox.Workflow;
const id = "63049f0d-756c-45db-9cc9-71fe1cbcc8bd";
const settings = { baseExposure: -1, participantExposure: -1, contrast: 0, monochrome: false };
const file = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" });
const blob = new Blob([new Uint8Array([255, 216, 255, 217])], { type: "image/jpeg" });
const begin = () => ({ submissionId: id, token: "private-token", originalId: "original-1", base: { id: "base-1", mimeType: "image/jpeg", base64: "AA==" } });
const receipt = () => ({ submissionId: id, saved: true, resultId: "result-1", originalId: "original-1", baseId: "base-1" });
const previewBase = () => ({ id: "base-1", name: "été #1? 50%.jpg", mimeType: "image/jpeg",
  path: "assets/base-photos/été #1? 50%.jpg", sha256: "a".repeat(64), byteLength: 1234 });
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function fixture(overrides = {}) {
  const calls = [];
  const storage = {
    begin: async (request) => { calls.push(["begin", request]); return begin(); },
    complete: async (request) => { calls.push(["complete", request]); return receipt(); },
    ...overrides.storage
  };
  const render = overrides.render || (async (request) => { calls.push(["render", request]); return { blob, width: 1200, height: 800 }; });
  const workflow = new Workflow({ storage, render, settings: overrides.settings || settings, makeId: () => id,
    onProgress: progress => { calls.push(["stage", progress.stage]); overrides.onProgress?.(progress); } });
  return { workflow, calls, storage };
}

function modeFixture({ monochrome = false, canRePair = true, originalRetained } = {}) {
  const calls = [];
  const bases = new Map();
  const original = originalRetained === undefined ? {} : {
    originalRetained, originalId: originalRetained ? "original-1" : `unretained:${"c".repeat(64)}`
  };
  let serial = 0;
  const storage = {
    begin: async request => {
      calls.push(["begin", request]);
      const baseId = request.reuse && request.reuse.sameBase !== true ? "base-2" : "base-1";
      bases.set(request.submissionId, baseId);
      return { ...begin(), ...original, submissionId: request.submissionId, token: `token-${request.submissionId}`,
        base: { id: baseId, mimeType: "image/jpeg", base64: "AA==" } };
    },
    complete: async request => {
      calls.push(["complete", request]);
      return { ...receipt(), ...original, submissionId: request.submissionId, resultId: `result-${request.submissionId}`,
        baseId: bases.get(request.submissionId), canRePair };
    }
  };
  const workflow = new Workflow({ storage,
    render: async request => { calls.push(["render", request]); return { blob, width: 1200, height: 800 }; },
    settings: { ...settings, monochrome }, makeId: () => `submission-${++serial}` });
  return { workflow, storage, calls, get idCount() { return serial; } };
}

function historyFixture({ canRePair = true } = {}) {
  const calls = [];
  const assigned = new Map();
  let serial = 0;
  let baseSerial = 0;
  const storage = {
    begin: async request => {
      calls.push(["begin", request]);
      const base = request.reuse?.sameBase
        ? assigned.get(request.reuse.submissionId)
        : { id: `base-${++baseSerial}`, mimeType: "image/jpeg",
          sha256: String.fromCharCode(96 + baseSerial).repeat(64),
          ...(request.artistOnly ? { path: `assets/base-photos/base-${baseSerial}.jpg`,
            name: `base-${baseSerial}.jpg`, byteLength: 1234 } : { base64: "AA==" }) };
      assigned.set(request.submissionId, base);
      return { ...begin(), submissionId: request.submissionId, token: `token-${request.submissionId}`, base };
    },
    complete: async request => {
      calls.push(["complete", request]);
      return { ...receipt(), submissionId: request.submissionId,
        resultId: `result-${request.submissionId}`, baseId: assigned.get(request.submissionId).id, canRePair };
    }
  };
  const workflow = new Workflow({ storage, settings,
    render: async request => { calls.push(["render", request]); return { blob, width: 1200, height: 800 }; },
    makeId: () => `history-${++serial}` });
  return { workflow, storage, calls, get idCount() { return serial; } };
}

test("exposure history is copied, deduplicated and frozen before any upload or render awaits", async () => {
  const h = historyFixture();
  const hashes = ["c".repeat(64), "d".repeat(64), "c".repeat(64)];
  const saving = h.workflow.start(file, { excludedBaseHashes: hashes });
  const operation = h.workflow.operation;
  assert.notStrictEqual(operation.excludedBaseHashes, hashes);
  assert.equal(Object.isFrozen(operation.excludedBaseHashes), true);
  hashes[0] = "a".repeat(64);
  hashes.push("b".repeat(64));
  await saving;
  assert.deepEqual([...operation.excludedBaseHashes], ["c".repeat(64), "d".repeat(64)]);
  for (const [, request] of h.calls.filter(([kind]) => ["begin", "complete"].includes(kind))) {
    assert.deepEqual([...request.excludedBaseHashes], ["c".repeat(64), "d".repeat(64)]);
  }
});

test("empty exposure history preserves the earlier begin and complete request shapes", async () => {
  for (const options of [{}, { excludedBaseHashes: [] }]) {
    const h = historyFixture();
    await h.workflow.start(file, options);
    assert.deepEqual([...h.workflow.operation.excludedBaseHashes], []);
    for (const [, request] of h.calls.filter(([kind]) => ["begin", "complete"].includes(kind))) {
      assert.equal(Object.hasOwn(request, "excludedBaseHashes"), false);
    }
  }
});

test("invalid exposure histories cannot start work or replace a saved pairing", async () => {
  const hash = "c".repeat(64);
  const invalid = [null, false, hash, {}, new Set([hash]), [null], ["A".repeat(64)], ["a".repeat(63)],
    ["a".repeat(65)], [new String(hash)], new Array(1), Array(20001).fill(hash)];
  for (const excludedBaseHashes of invalid) {
    const fresh = historyFixture();
    await assert.rejects(fresh.workflow.start(file, { excludedBaseHashes }));
    assert.equal(fresh.idCount, 0);
    assert.equal(fresh.workflow.operation, null);
    assert.equal(fresh.calls.length, 0);
    const saved = historyFixture();
    const previous = await saved.workflow.start(file);
    const count = saved.calls.length;
    await assert.rejects(saved.workflow.rePair({ excludedBaseHashes }));
    assert.strictEqual(saved.workflow.operation, previous);
    assert.equal(saved.idCount, 1);
    assert.equal(saved.calls.length, count);
  }
  const valid = historyFixture();
  await valid.workflow.start(file, { excludedBaseHashes: Array(20000).fill(hash) });
  assert.deepEqual([...valid.workflow.operation.excludedBaseHashes], [hash]);
});

test("upload and archive retries retain the same exposure history, identity and finished JPEG", async () => {
  const requests = [];
  let beginCalls = 0;
  let completeCalls = 0;
  const h = fixture({ storage: {
    begin: async request => {
      requests.push(["begin", request]);
      if (++beginCalls === 1) throw new Error("original response lost");
      return { ...begin(), base: { ...begin().base, sha256: "a".repeat(64) } };
    },
    complete: async request => {
      requests.push(["complete", request]);
      if (++completeCalls === 1) throw new Error("archive response lost");
      return receipt();
    }
  } });
  const callerHistory = ["c".repeat(64)];
  await assert.rejects(h.workflow.start(file, { excludedBaseHashes: callerHistory }), /original response lost/);
  const pending = h.workflow.operation;
  callerHistory[0] = "a".repeat(64);
  await assert.rejects(h.workflow.retry(), /archive response lost/);
  const rendered = pending.result;
  callerHistory.push("b".repeat(64));
  await h.workflow.retry();
  assert.strictEqual(h.workflow.operation, pending);
  assert.strictEqual(pending.result, rendered);
  assert.equal(h.calls.filter(([kind]) => kind === "render").length, 1);
  assert.deepEqual(requests.map(([kind]) => kind), ["begin", "begin", "complete", "complete"]);
  for (const [, request] of requests) {
    assert.equal(request.submissionId, id);
    assert.deepEqual([...request.excludedBaseHashes], ["c".repeat(64)]);
  }
  assert.strictEqual(requests[2][1].resultBlob, rendered.blob);
  assert.strictEqual(requests[3][1].resultBlob, rendered.blob);
});

test("another pairing inherits its saved history unless the current session supplies a newer snapshot", async () => {
  const h = historyFixture();
  const original = await h.workflow.start(file, { excludedBaseHashes: ["d".repeat(64)] });
  const inherited = await h.workflow.rePair();
  assert.deepEqual([...inherited.excludedBaseHashes], ["d".repeat(64)]);
  const latest = ["a".repeat(64), "b".repeat(64), "d".repeat(64)];
  const saving = h.workflow.rePair({ excludedBaseHashes: latest });
  latest.push("c".repeat(64));
  const next = await saving;
  assert.deepEqual([...next.excludedBaseHashes], ["a".repeat(64), "b".repeat(64), "d".repeat(64)]);
  assert.deepEqual([...original.excludedBaseHashes], ["d".repeat(64)]);
  const pairRequests = h.calls.filter(([kind, request]) => kind === "begin" && request.reuse);
  assert.equal(pairRequests.length, 2);
  for (const [, request] of pairRequests) {
    assert.equal(Object.hasOwn(request, "originalFile"), false);
    assert.equal(Object.hasOwn(request, "preferredBaseSha256"), false);
  }
});

test("a saved colour variant inherits history without replacing a base later marked as already seen", async () => {
  const h = historyFixture();
  const parent = await h.workflow.start(file);
  const history = Object.freeze([parent.begin.base.sha256, "d".repeat(64)]);
  parent.excludedBaseHashes = history;
  const prepared = { blob, width: 1200, height: 800 };
  const variant = await h.workflow.changeMonochrome(true, { result: prepared, base: parent.begin.base });
  assert.equal(variant.begin.base.sha256, parent.begin.base.sha256);
  assert.strictEqual(variant.result.blob, prepared.blob);
  assert.deepEqual([...variant.excludedBaseHashes], [...history]);
  assert.equal(Object.isFrozen(variant.excludedBaseHashes), true);
  assert.equal(h.calls.filter(([kind]) => kind === "render").length, 1);
  const requests = h.calls.filter(([kind, request]) => ["begin", "complete"].includes(kind)
    && request.submissionId === variant.submissionId);
  assert.equal(requests[0][1].reuse.sameBase, true);
  assert.equal(Object.hasOwn(requests[0][1], "originalFile"), false);
  for (const [, request] of requests) assert.deepEqual([...request.excludedBaseHashes], [...history]);
});

test("an excluded local candidate never starts an upload, preview or archive", async () => {
  const h = historyFixture();
  const candidate = previewBase();
  await assert.rejects(h.workflow.start(file, { previewBase: candidate, excludedBaseHashes: [candidate.sha256] }));
  assert.equal(h.workflow.operation, null);
  assert.equal(h.idCount, 0);
  assert.equal(h.calls.length, 0);
});

test("an excluded authenticated candidate never reaches rendering or result archiving", async () => {
  const h = historyFixture();
  await assert.rejects(h.workflow.start(file, { excludedBaseHashes: ["a".repeat(64)] }));
  assert.deepEqual(h.calls.map(([kind]) => kind), ["begin"]);
  assert.equal(h.workflow.operation.begin, null);
  assert.equal(h.workflow.operation.result, null);
  assert.equal(h.workflow.operation.receipt, null);
  assert.equal(h.workflow.pending, true);
});

test("an excluded re-pairing response cannot replace the saved pair or render another result", async () => {
  const h = historyFixture();
  const previous = await h.workflow.start(file);
  const renderCount = h.calls.filter(([kind]) => kind === "render").length;
  const completeCount = h.calls.filter(([kind]) => kind === "complete").length;
  await assert.rejects(h.workflow.rePair({ excludedBaseHashes: ["b".repeat(64)] }));
  assert.equal(h.calls.filter(([kind]) => kind === "render").length, renderCount);
  assert.equal(h.calls.filter(([kind]) => kind === "complete").length, completeCount);
  assert.equal(h.workflow.operation.begin, null);
  assert.equal(h.workflow.operation.receipt, null);
  assert.equal(previous.receipt.saved, true);
  assert.equal(previous.begin.base.sha256, "a".repeat(64));
});

test("a substituted excluded response cannot archive a safe concurrent local preview", async () => {
  const preferred = previewBase();
  const excludedHash = "b".repeat(64);
  const h = fixture({ storage: {
    begin: async () => ({ ...begin(), base: { ...preferred, sha256: excludedHash } })
  } });
  await assert.rejects(h.workflow.start(file, { previewBase: preferred, excludedBaseHashes: [excludedHash] }));
  const renderCalls = h.calls.filter(([kind]) => kind === "render");
  assert.equal(renderCalls.length, 1, "the locally pinned safe preview can render while Google responds");
  assert.equal(renderCalls[0][1].base.sha256, preferred.sha256);
  assert.equal(h.calls.some(([kind]) => kind === "complete"), false);
  assert.equal(h.workflow.operation.begin, null);
  assert.equal(h.workflow.operation.receipt, null);
  assert.equal(h.workflow.pending, true);
});

test("artist-only selection is frozen per operation, inherited by pairing and colour, and can return to a mixed pool", async () => {
  const h = historyFixture();
  const options = { allowReuse: true, artistOnly: true, excludedBaseHashes: ["d".repeat(64)] };
  const saving = h.workflow.start(file, options);
  options.artistOnly = false;
  options.allowReuse = false;
  const first = await saving;
  assert.equal(first.artistOnly, true);
  assert.equal(first.allowReuse, true);
  const second = await h.workflow.rePair();
  assert.equal(second.artistOnly, true);
  assert.equal(second.allowReuse, true);
  const colour = await h.workflow.changeMonochrome(true);
  assert.equal(colour.artistOnly, true);
  assert.equal(colour.begin.base.sha256, second.begin.base.sha256);
  const mixed = await h.workflow.rePair({ artistOnly: false });
  assert.equal(mixed.artistOnly, false);
  assert.equal(mixed.allowReuse, true);
  assert.equal(mixed.settings.monochrome, true);
  assert.deepEqual([...mixed.excludedBaseHashes], ["d".repeat(64)]);
  assert.equal(first.artistOnly, true, "a later pool choice must not rewrite a saved operation");
  const operations = new Map([first, second, colour, mixed].map(operation => [operation.submissionId, operation]));
  for (const [, request] of h.calls.filter(([kind]) => ["begin", "complete"].includes(kind))) {
    const operation = operations.get(request.submissionId);
    if (operation.artistOnly) assert.equal(request.artistOnly, true);
    else assert.equal(Object.hasOwn(request, "artistOnly"), false);
  }
});

test("an exhausted pool allows another scope while same-scope pairing stays unavailable", async () => {
  for (const artistOnly of [false, true]) {
    const h = historyFixture({ canRePair: false });
    const first = await h.workflow.start(file, { artistOnly, allowReuse: true });
    const count = h.calls.length;
    await assert.rejects(h.workflow.rePair(), /no other photograph/);
    assert.strictEqual(h.workflow.operation, first);
    assert.equal(h.calls.length, count);

    const next = await h.workflow.rePair({ artistOnly: !artistOnly });
    assert.equal(next.artistOnly, !artistOnly);
    assert.equal(next.allowReuse, first.allowReuse);
    assert.strictEqual(next.file, first.file);
    assert.notEqual(next.begin.base.sha256, first.begin.base.sha256);
    assert.equal(first.artistOnly, artistOnly);
    const pairingRequest = h.calls.filter(([kind]) => kind === "begin")[1][1];
    assert.equal(pairingRequest.artistOnly === true, !artistOnly);
    assert.equal(Object.hasOwn(pairingRequest, "originalFile"), false);
    assert.equal(Object.hasOwn(pairingRequest, "allowReuse"), false);
    await assert.rejects(h.workflow.rePair(), /no other photograph/);

    const colour = await h.workflow.changeMonochrome(true);
    assert.equal(colour.artistOnly, next.artistOnly);
    assert.equal(colour.allowReuse, next.allowReuse);
    assert.equal(colour.begin.base.sha256, next.begin.base.sha256);
    const colourRequest = h.calls.filter(([kind]) => kind === "begin")[2][1];
    assert.equal(colourRequest.reuse.sameBase, true);
  }
});

test("a switched-pool pairing retries its frozen scope and receipt despite an exhausted parent pool", async () => {
  for (const artistOnly of [false, true]) {
    const h = historyFixture({ canRePair: false });
    const previous = await h.workflow.start(file, { artistOnly, allowReuse: false });
    const beginRequest = h.storage.begin;
    const completeRequest = h.storage.complete;
    const attempts = [];
    let pinned;
    let loseBegin = true;
    let loseReceipt = true;
    h.storage.begin = async request => {
      attempts.push(["begin", request]);
      pinned ||= await beginRequest(request);
      if (loseBegin) { loseBegin = false; throw new Error("lost switched-pool begin response"); }
      return pinned;
    };
    h.storage.complete = async request => {
      attempts.push(["complete", request]);
      const saved = await completeRequest(request);
      if (loseReceipt) { loseReceipt = false; throw new Error("lost switched-pool receipt"); }
      return saved;
    };

    const choice = { artistOnly: !artistOnly };
    await assert.rejects(h.workflow.rePair(choice), /lost switched-pool begin response/);
    const operation = h.workflow.operation;
    choice.artistOnly = artistOnly;
    assert.equal(operation.artistOnly, !artistOnly);
    assert.equal(operation.allowReuse, previous.allowReuse);
    assert.equal(h.workflow.pending, true);
    await assert.rejects(h.workflow.rePair({ artistOnly }), /Finish saving/);
    await assert.rejects(h.workflow.changeMonochrome(true), /Finish saving/);
    await assert.rejects(h.workflow.retry(), /lost switched-pool receipt/);
    assert.strictEqual(await h.workflow.retry(), operation);
    assert.equal(h.workflow.pending, false);
    assert.deepEqual(attempts.map(([kind]) => kind), ["begin", "begin", "complete", "complete"]);
    for (const [kind, request] of attempts) {
      assert.equal(request.submissionId, operation.submissionId);
      assert.equal(request.artistOnly === true, !artistOnly);
      if (kind === "begin") {
        assert.equal(request.reuse.submissionId, previous.submissionId);
        assert.equal(request.reuse.token, previous.begin.token);
        assert.equal(Object.hasOwn(request, "allowReuse"), false);
        assert.equal(Object.hasOwn(request, "originalFile"), false);
      } else {
        assert.strictEqual(request.resultBlob, operation.result.blob);
      }
    }
    assert.equal(operation.begin.base.sha256, pinned.base.sha256);
    assert.equal(operation.allowReuse, false);
    assert.equal(previous.artistOnly, artistOnly);
    assert.equal(previous.receipt.canRePair, false);
  }
});

test("artist-only pool selection is independent of the original retention answer", async () => {
  for (const allowReuse of [false, true]) {
    for (const artistOnly of [false, true]) {
      const h = historyFixture();
      const operation = await h.workflow.start(file, { allowReuse, artistOnly });
      const request = h.calls.find(([kind]) => kind === "begin")[1];
      assert.equal(operation.allowReuse, allowReuse);
      assert.equal(operation.artistOnly, artistOnly);
      assert.equal(request.allowReuse, allowReuse);
      assert.strictEqual(request.originalFile, file);
      assert.equal(request.artistOnly === true, artistOnly);
      if (!artistOnly) assert.equal(Object.hasOwn(request, "artistOnly"), false);
    }
  }
  const h = historyFixture();
  await h.workflow.start(file);
  assert.equal(h.workflow.operation.artistOnly, false);
  for (const [, request] of h.calls.filter(([kind]) => ["begin", "complete"].includes(kind))) {
    assert.equal(Object.hasOwn(request, "artistOnly"), false);
  }
});

test("artist-only selection refuses participant-style local and authenticated candidates before rendering", async () => {
  const local = fixture();
  const dynamicPreview = { ...previewBase() };
  delete dynamicPreview.path;
  await assert.rejects(local.workflow.start(file, { artistOnly: true, previewBase: dynamicPreview }));
  assert.equal(local.workflow.operation, null);
  assert.equal(local.calls.length, 0);
  const authenticated = fixture();
  await assert.rejects(authenticated.workflow.start(file, { artistOnly: true }));
  assert.deepEqual(authenticated.calls.filter(([kind]) => kind !== "stage").map(([kind]) => kind), ["begin"]);
  assert.equal(authenticated.workflow.operation.begin, null);
  assert.equal(authenticated.workflow.operation.result, null);
  assert.equal(authenticated.workflow.operation.receipt, null);
});

test("nonboolean artist-only choices cannot start work or replace an existing saved operation", async () => {
  for (const artistOnly of [null, 0, 1, "true", "false", {}, [], new Boolean(false)]) {
    const fresh = historyFixture();
    await assert.rejects(fresh.workflow.start(file, { artistOnly }));
    assert.equal(fresh.idCount, 0);
    assert.equal(fresh.workflow.operation, null);
    assert.equal(fresh.calls.length, 0);
    const saved = historyFixture();
    const previous = await saved.workflow.start(file, { artistOnly: true });
    const count = saved.calls.length;
    await assert.rejects(saved.workflow.rePair({ artistOnly }));
    assert.strictEqual(saved.workflow.operation, previous);
    assert.equal(saved.idCount, 1);
    assert.equal(saved.calls.length, count);
  }
});

test("an uncertain artist-only upload and archive retry keep the same pool choice and consent", async () => {
  const requests = [];
  let firstUpload = true;
  let firstArchive = true;
  const h = fixture({ storage: {
    begin: async request => {
      requests.push(["begin", request]);
      if (firstUpload) { firstUpload = false; throw new Error("lost upload response"); }
      return { ...begin(), base: previewBase() };
    },
    complete: async request => {
      requests.push(["complete", request]);
      if (firstArchive) { firstArchive = false; throw new Error("lost archive response"); }
      return receipt();
    }
  } });
  const choice = { artistOnly: true, allowReuse: false };
  await assert.rejects(h.workflow.start(file, choice), /lost upload response/);
  choice.artistOnly = false;
  choice.allowReuse = true;
  await assert.rejects(h.workflow.retry(), /lost archive response/);
  await h.workflow.retry();
  assert.equal(h.workflow.operation.artistOnly, true);
  assert.equal(h.workflow.operation.allowReuse, false);
  assert.deepEqual(requests.map(([kind]) => kind), ["begin", "begin", "complete", "complete"]);
  for (const [kind, request] of requests) {
    assert.equal(request.artistOnly, true);
    if (kind === "begin") assert.equal(request.allowReuse, false);
  }
});

test("saves the exact original before developing, then requires a matching archive receipt", async () => {
  const { workflow, calls } = fixture();
  const operation = await workflow.start(file);
  assert.deepEqual(calls.filter(([type]) => type !== "stage").map(([type]) => type), ["begin", "render", "complete"]);
  assert.strictEqual(calls.find(([type]) => type === "begin")[1].originalFile, file);
  assert.strictEqual(calls.find(([type]) => type === "complete")[1].resultBlob, blob);
  assert.equal(operation.receipt.resultId, "result-1");
  assert.equal(workflow.pending, false);
  assert.equal(workflow.busy, false);
});

test("a static base descriptor reaches the renderer unchanged and keeps its archive identity", async () => {
  const base = { id: "base-1", mimeType: "image/jpeg", path: "assets/base-photos/été #1? 50%.jpg",
    name: "été #1? 50%.jpg", sha256: "a".repeat(64), byteLength: 1234 };
  const { workflow, calls } = fixture({ storage: { begin: async () => ({ ...begin(), base }) } });
  const saved = await workflow.start(file);
  assert.strictEqual(saved.begin.base, base);
  assert.strictEqual(calls.find(([type]) => type === "render")[1].base, base);
  assert.equal(saved.receipt.baseId, base.id);
  assert.equal(saved.begin.base.base64, undefined);
  assert.equal(workflow.pending, false);
  const mismatched = fixture({ storage: {
    begin: async () => ({ ...begin(), base }), complete: async () => ({ ...receipt(), baseId: "another-base" })
  } });
  await assert.rejects(mismatched.workflow.start(file), /did not confirm/);
  assert.equal(mismatched.workflow.pending, true);
  assert.strictEqual(mismatched.workflow.operation.begin.base, base);
});

test("a local manifest candidate renders before Google supplies its authoritative source ID", async () => {
  const previewBase = { mimeType: "image/jpeg", path: "assets/base-photos/base.jpg",
    name: "base.jpg", sha256: "a".repeat(64), byteLength: 1234 };
  const { workflow, calls } = fixture({ storage: {
    begin: async () => ({ ...begin(), base: { ...previewBase, id: "base-1" } })
  } });
  const saved = await workflow.start(file, { previewBase });
  assert.equal(saved.previewBase.id, undefined);
  assert.equal(saved.begin.base.id, "base-1");
  assert.equal(saved.receipt.baseId, "base-1");
  assert.equal(calls.find(([type]) => type === "render")[1].base.id, undefined);
  assert.equal(calls.filter(([type]) => type === "complete").length, 1);
});

test("a pinned static base develops while the original upload is pending and previews before archive confirmation", async () => {
  const original = deferred();
  const developing = deferred();
  const requests = [];
  const renders = [];
  const base = previewBase();
  let previewResult;
  const { workflow, calls } = fixture({
    storage: { begin: request => { requests.push(request); return original.promise; } },
    render: request => { renders.push(request); return developing.promise; },
    onProgress: ({ stage }) => { if (stage === "preview") previewResult = workflow.operation.result; }
  });
  const saving = workflow.start(file, { allowReuse: true, monochrome: true, previewBase: base });
  await flush();
  assert.equal(requests.length, 1);
  assert.equal(renders.length, 1, "local development must not wait for the original upload response");
  assert.strictEqual(requests[0].originalFile, file);
  assert.equal(requests[0].allowReuse, true);
  assert.equal(requests[0].preferredBaseSha256, base.sha256);
  assert.deepEqual({ ...renders[0].base }, base);
  assert.equal(renders[0].settings.monochrome, true);
  developing.resolve({ blob, width: 1200, height: 800 });
  await flush();
  assert.strictEqual(previewResult, workflow.operation.result);
  assert.strictEqual(previewResult.blob, blob);
  assert.equal(workflow.operation.begin, null);
  assert.equal(workflow.operation.receipt, null);
  assert.equal(workflow.pending, true);
  assert.equal(workflow.busy, true);
  assert.equal(calls.some(([type]) => type === "complete"), false);
  assert.equal(calls.some(([type, stage]) => type === "stage" && stage === "saved"), false);
  original.resolve({ ...begin(), base: { ...base } });
  const saved = await saving;
  const archived = calls.find(([type]) => type === "complete")[1];
  assert.strictEqual(archived.resultBlob, blob);
  assert.strictEqual(archived.settings, renders[0].settings);
  assert.equal(saved.begin.base.sha256, base.sha256);
  assert.equal(saved.receipt.saved, true);
  assert.equal(workflow.pending, false);
});

test("a confirmed original waits for its concurrent render before completing the archive", async () => {
  const developing = deferred();
  const base = previewBase();
  const { workflow, calls } = fixture({ storage: { begin: async () => ({ ...begin(), base }) },
    render: () => developing.promise });
  const saving = workflow.start(file, { previewBase: base });
  await flush();
  assert.equal(calls.some(([type]) => type === "complete"), false);
  assert.equal(workflow.operation.result, null);
  assert.equal(workflow.pending, true);
  developing.resolve({ blob, width: 1200, height: 800 });
  await saving;
  assert.equal(calls.filter(([type]) => type === "complete").length, 1);
  assert.equal(calls.some(([type, stage]) => type === "stage" && stage === "preview"), true);
});

test("a rejected original upload retains its concurrent JPEG and retries the same pinned request", async () => {
  const original = deferred();
  const base = previewBase();
  const requests = [];
  const renders = [];
  const { workflow, calls, storage } = fixture({
    storage: { begin: request => { requests.push(request); return original.promise; } },
    render: async request => { renders.push(request); return { blob, width: 1200, height: 800 }; }
  });
  const saving = workflow.start(file, { allowReuse: true, monochrome: true, previewBase: base });
  await flush();
  const pending = workflow.operation;
  const result = pending.result;
  assert.strictEqual(result.blob, blob);
  const rejected = assert.rejects(saving, error => !error.originalSaved && error.resultReady);
  original.reject(new Error("original response lost"));
  await rejected;
  assert.equal(workflow.pending, true);
  assert.equal(workflow.busy, false);
  assert.equal(calls.some(([type]) => type === "complete"), false);
  storage.begin = async request => { requests.push(request); return { ...begin(), base: previewBase() }; };
  workflow.settings = Object.freeze({ ...settings, monochrome: false, contrast: 40 });
  const saved = await workflow.retry();
  assert.strictEqual(saved, pending);
  assert.strictEqual(saved.result, result);
  assert.equal(renders.length, 1, "a retry preserves the already-previewed JPEG");
  assert.equal(requests.length, 2);
  assert.deepEqual({ ...requests[0] }, { ...requests[1] });
  assert.equal(requests[1].preferredBaseSha256, base.sha256);
  assert.strictEqual(requests[1].originalFile, file);
  const archived = calls.find(([type]) => type === "complete")[1];
  assert.strictEqual(archived.resultBlob, result.blob);
  assert.strictEqual(archived.settings, renders[0].settings);
  assert.equal(archived.settings.monochrome, true);
});

test("a confirmed base must match every pinned static descriptor field before any result can be archived", async () => {
  for (const changed of [
    { id: "another-base" }, { sha256: "b".repeat(64) }, { mimeType: "image/png" },
    { byteLength: 1235 }, { name: "another.jpg" }, { path: "assets/base-photos/another.jpg" }
  ]) {
    const base = previewBase();
    const requests = [];
    const renders = [];
    const { workflow, calls, storage } = fixture({
      storage: { begin: async request => { requests.push(request); return { ...begin(), base: { ...base, ...changed } }; } },
      render: async request => { renders.push(request); return { blob, width: 1200, height: 800 }; }
    });
    await assert.rejects(workflow.start(file, { previewBase: base }), /confirm|match/i);
    const pending = workflow.operation;
    assert.equal(pending.begin, null, `a mismatched ${Object.keys(changed)[0]} must not be committed`);
    assert.equal(pending.receipt, null);
    assert.equal(calls.some(([type]) => type === "complete"), false);
    assert.equal(calls.some(([type, stage]) => type === "stage" && stage === "saved"), false);
    assert.equal(workflow.pending, true);
    assert.strictEqual(pending.result.blob, blob);
    storage.begin = async request => { requests.push(request); return { ...begin(), base: previewBase() }; };
    await workflow.retry();
    assert.strictEqual(workflow.operation, pending);
    assert.equal(renders.length, 1);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].preferredBaseSha256, base.sha256);
    assert.equal(requests[1].preferredBaseSha256, base.sha256);
    assert.equal(workflow.pending, false);
  }
});

test("a dynamic pinned candidate without a static path waits for its authenticated base before rendering", async () => {
  const original = deferred();
  const base = previewBase();
  delete base.path;
  const confirmed = { ...base, base64: "AA==" };
  const requests = [];
  const { workflow, calls } = fixture({ storage: {
    begin: request => { requests.push(request); return original.promise; }
  } });
  const saving = workflow.start(file, { previewBase: base });
  await flush();
  assert.equal(requests[0].preferredBaseSha256, base.sha256);
  assert.equal(calls.some(([type]) => type === "render" || type === "complete"), false);
  assert.equal(calls.some(([type, stage]) => type === "stage" && stage === "preview"), false);
  original.resolve({ ...begin(), base: confirmed });
  await saving;
  assert.strictEqual(calls.find(([type]) => type === "render")[1].base, confirmed);
  assert.equal(workflow.operation.receipt.saved, true);
});

test("a failed concurrent render retains the confirmed original and retries only development", async () => {
  const base = previewBase();
  const developing = deferred();
  let begins = 0;
  const { workflow, calls } = fixture({
    storage: { begin: async () => { begins++; return { ...begin(), base }; } },
    render: () => developing.promise
  });
  const saving = workflow.start(file, { previewBase: base });
  await flush();
  const rejected = assert.rejects(saving, error => error.originalSaved && !error.resultReady);
  developing.reject(new Error("image decoding failed"));
  await rejected;
  assert.equal(workflow.operation.begin.base.sha256, base.sha256);
  assert.equal(calls.some(([type]) => type === "complete"), false);
  assert.equal(calls.some(([type, stage]) => type === "stage" && stage === "preview"), false);
  workflow.render = async () => ({ blob, width: 1200, height: 800 });
  await workflow.retry();
  assert.equal(begins, 1);
  assert.equal(workflow.pending, false);
});

test("an invalid concurrent render cannot produce a preview or an archived result", async () => {
  for (const result of [
    { blob: new Blob(["not JPEG"], { type: "image/png" }), width: 1200, height: 800 },
    { blob: new Blob([], { type: "image/jpeg" }), width: 1200, height: 800 },
    { blob, width: 0, height: 800 }
  ]) {
    const base = previewBase();
    const { workflow, calls } = fixture({ storage: { begin: async () => ({ ...begin(), base }) },
      render: async () => result });
    await assert.rejects(workflow.start(file, { previewBase: base }), /develop|exposure/i);
    assert.equal(workflow.operation.result, null);
    assert.equal(workflow.operation.receipt, null);
    assert.equal(calls.some(([type]) => type === "complete"), false);
    assert.equal(calls.some(([type, stage]) => type === "stage" && stage === "preview"), false);
  }
});

test("colour variants and later pairings do not inherit the initial static candidate preference", async () => {
  const { workflow, calls, storage } = modeFixture();
  const originalBegin = storage.begin;
  storage.begin = async request => ({ ...await originalBegin(request), base: previewBase() });
  await workflow.start(file, { previewBase: previewBase() });
  const assigned = deferred();
  storage.begin = async request => {
    const response = await originalBegin(request);
    await assigned.promise;
    return response;
  };
  const changing = workflow.changeMonochrome(true);
  await flush();
  assert.equal(calls.filter(([type]) => type === "render").length, 1, "a colour variant still waits for authenticated reuse");
  let requests = calls.filter(([type]) => type === "begin").map(([, request]) => request);
  assert.equal(requests[0].preferredBaseSha256, previewBase().sha256);
  assert.equal("preferredBaseSha256" in requests[1], false);
  assert.equal(requests[1].reuse.sameBase, true);
  assigned.resolve();
  await changing;
  await workflow.rePair();
  requests = calls.filter(([type]) => type === "begin").map(([, request]) => request);
  assert.equal("preferredBaseSha256" in requests[2], false);
  assert.equal("sameBase" in requests[2].reuse, false);
});

test("ambiguous or absent base data never reaches rendering or archives a result", async () => {
  for (const base of [
    { id: "base-1", mimeType: "image/jpeg", path: "assets/base-photos/base.jpg", base64: "AA==" },
    { id: "base-1", mimeType: "image/jpeg" }
  ]) {
    const { workflow, calls } = fixture({ storage: { begin: async () => ({ ...begin(), base }) } });
    await assert.rejects(workflow.start(file), /did not confirm/);
    assert.equal(calls.some(([type]) => type === "render" || type === "complete"), false);
    assert.equal(workflow.operation.submissionId, id);
    assert.strictEqual(workflow.operation.file, file);
    assert.equal(workflow.operation.begin, null);
    assert.equal(workflow.operation.result, null);
    assert.equal(workflow.operation.receipt, null);
    assert.equal(workflow.pending, true);
  }
});

test("sharing is opt-in and is sent with the exact original", async () => {
  const { workflow, calls } = fixture();
  await workflow.start(file);
  const firstBegin = calls.find(([type]) => type === "begin")[1];
  assert.equal(firstBegin.allowReuse, false);
  assert.strictEqual(firstBegin.originalFile, file);
  await workflow.start(file, { allowReuse: true });
  const secondBegin = calls.filter(([type]) => type === "begin")[1][1];
  assert.equal(secondBegin.allowReuse, true);
});

test("an unretained original supports authenticated variants, new pairings and identical archive retries", async () => {
  const { workflow, calls, storage } = modeFixture({ originalRetained: false });
  const complete = storage.complete;
  const attempts = [];
  const failed = new Set();
  storage.complete = async request => {
    attempts.push(request);
    if (!failed.has(request.submissionId)) {
      failed.add(request.submissionId);
      throw Object.assign(new Error("response lost"), { code: "REQUEST_TIMEOUT", originalSaved: true });
    }
    return complete(request);
  };
  const retryExposure = async (saving, expectedBlob) => {
    await assert.rejects(saving, error => error.stage === "archive" && error.originalSaved === false && error.resultReady);
    const pending = workflow.operation;
    const assigned = pending.begin;
    assert.equal(workflow.pending, true);
    assert.equal(assigned.originalRetained, false);
    assert.equal(assigned.originalId, `unretained:${"c".repeat(64)}`);
    assert.strictEqual(pending.file, file);
    const saved = await workflow.retry();
    assert.strictEqual(saved, pending);
    assert.strictEqual(saved.begin, assigned);
    assert.equal(saved.receipt.originalId, assigned.originalId);
    assert.equal(saved.receipt.originalRetained, false);
    assert.equal(saved.allowReuse, false);
    assert.equal(workflow.pending, false);
    const requests = attempts.filter(request => request.submissionId === saved.submissionId);
    assert.equal(requests.length, 2);
    assert.strictEqual(requests[0].resultBlob, expectedBlob);
    assert.strictEqual(requests[1].resultBlob, expectedBlob);
    assert.strictEqual(requests[0].settings, requests[1].settings);
    assert.equal(requests[0].token, assigned.token);
    assert.equal(requests[1].token, assigned.token);
    assert.equal(Object.isFrozen(requests[1].settings), true);
    return saved;
  };
  const first = await retryExposure(workflow.start(file, { allowReuse: false }), blob);
  workflow.settings = Object.freeze({ ...settings, contrast: 40, monochrome: true });
  const prepared = { blob: new Blob(["cached colour JPEG"], { type: "image/jpeg" }), width: 640, height: 480 };
  const variant = await retryExposure(workflow.changeMonochrome(true, { result: prepared, base: first.begin.base }), prepared.blob);
  const paired = await retryExposure(workflow.rePair(), blob);
  const requests = calls.filter(([type]) => type === "begin").map(([, request]) => request);
  assert.equal(requests.length, 3, "archive retries do not submit another original or choose another base");
  assert.strictEqual(requests[0].originalFile, file);
  assert.equal(requests[0].allowReuse, false);
  assert.deepEqual({ ...requests[1].reuse }, { submissionId: first.submissionId, token: first.begin.token, sameBase: true });
  assert.deepEqual({ ...requests[2].reuse }, { submissionId: variant.submissionId, token: variant.begin.token });
  for (const request of requests.slice(1)) {
    assert.equal("originalFile" in request, false);
    assert.equal("allowReuse" in request, false, "the authenticated parent determines inherited consent");
  }
  assert.equal(variant.begin.base.id, first.begin.base.id);
  assert.notEqual(paired.begin.base.id, variant.begin.base.id);
  assert.equal(paired.settings.monochrome, true);
  assert.equal(paired.settings.contrast, settings.contrast);
  const renders = calls.filter(([type]) => type === "render").map(([, request]) => request);
  assert.equal(renders.length, 2, "the prepared colour JPEG is archived without regenerating it");
  for (const request of renders) assert.strictEqual(request.file, file, "local development retains the exact selected file");
});

test("a rejected prepared pairing reports whether the authenticated original was retained", async () => {
  for (const originalRetained of [false, true]) {
    const { workflow, storage } = modeFixture({ originalRetained });
    const saved = await workflow.start(file, { allowReuse: originalRetained });
    const assign = storage.begin;
    storage.begin = async request => ({ ...await assign(request), base: { ...saved.begin.base, id: "substituted-base" } });
    await assert.rejects(workflow.changeMonochrome(true, {
      result: { blob, width: 640, height: 480 }, base: saved.begin.base
    }), error => /did not confirm the prepared/.test(error.message) && error.originalSaved === originalRetained);
    assert.equal(workflow.operation.begin, null);
    assert.equal(workflow.operation.receipt, null);
    assert.strictEqual(workflow.operation.file, file);
  }
});

test("the artist's monochrome default and each visitor override reach rendering and archiving together", async () => {
  for (const artistDefault of [false, true]) {
    for (const visitorChoice of [undefined, false, true]) {
      const { workflow, calls } = fixture({ settings: { ...settings, monochrome: artistDefault } });
      const operation = await workflow.start(file, visitorChoice === undefined ? {} : { monochrome: visitorChoice });
      const expected = visitorChoice ?? artistDefault;
      const uploading = calls.find(([type]) => type === "begin")[1];
      const rendering = calls.find(([type]) => type === "render")[1];
      const saving = calls.find(([type]) => type === "complete")[1];
      assert.equal(operation.settings.monochrome, expected);
      assert.equal(rendering.settings.monochrome, expected);
      assert.equal(saving.settings.monochrome, expected);
      assert.strictEqual(rendering.settings, saving.settings, "the archived recipe belongs to the rendered JPEG");
      assert.equal(Object.isFrozen(operation.settings), true);
      assert.equal(workflow.settings.monochrome, artistDefault, "visitor selection does not rewrite the artist's default");
      assert.equal(operation.settings.baseExposure, settings.baseExposure);
      assert.equal(operation.settings.participantExposure, settings.participantExposure);
      assert.equal(operation.settings.contrast, settings.contrast);
      assert.strictEqual(uploading.originalFile, file, "colour mode never replaces or modifies the original upload");
      assert.equal(uploading.allowReuse, false, "colour mode does not grant future-use consent");
    }
  }
});

test("invalid monochrome selections do not start an upload or replace a saved operation", async () => {
  const { workflow, calls } = fixture();
  const previous = await workflow.start(file);
  const count = calls.length;
  for (const monochrome of [null, 0, 1, "false", {}, []]) {
    await assert.rejects(workflow.start(file, { monochrome }), /black.and.white|monochrome/i);
    assert.strictEqual(workflow.operation, previous);
  }
  assert.equal(calls.length, count);
});

test("an in-flight exposure snapshots the selected mode before upload and preserves it for retries", async () => {
  let resume;
  const requests = [];
  const { workflow, calls, storage } = fixture({ settings: { ...settings, monochrome: true }, storage: {
    begin: () => new Promise(resolve => { resume = resolve; }),
    complete: async request => { requests.push(request); throw new Error("response lost"); }
  } });
  const choice = { monochrome: false };
  const pending = workflow.start(file, choice);
  choice.monochrome = true;
  workflow.settings = Object.freeze({ ...settings, monochrome: true });
  resume(begin());
  await assert.rejects(pending, /response lost/);
  storage.complete = async request => { requests.push(request); return receipt(); };
  await workflow.retry();
  assert.equal(calls.filter(([type]) => type === "render").length, 1);
  assert.equal(calls.find(([type]) => type === "render")[1].settings.monochrome, false);
  assert.equal(requests[0].settings.monochrome, false);
  assert.strictEqual(requests[0].settings, requests[1].settings);
  assert.strictEqual(requests[0].resultBlob, requests[1].resultBlob);
});

test("another pairing inherits its original visitor colour mode rather than a changed default", async () => {
  const renders = [], saves = [];
  let serial = 0;
  const workflow = new Workflow({
    storage: {
      begin: async request => ({ ...begin(), submissionId: request.submissionId }),
      complete: async request => { saves.push(request); return { ...receipt(), submissionId: request.submissionId, canRePair: true }; }
    },
    render: async request => { renders.push(request); return { blob, width: 1200, height: 800 }; },
    settings: { ...settings, monochrome: true }, makeId: () => `submission-${++serial}`
  });
  const first = await workflow.start(file, { monochrome: false });
  workflow.settings = Object.freeze({ ...settings, monochrome: true });
  const second = await workflow.rePair();
  assert.equal(first.settings.monochrome, false);
  assert.equal(second.settings.monochrome, false);
  assert.deepEqual(renders.map(request => request.settings.monochrome), [false, false]);
  assert.deepEqual(saves.map(request => request.settings.monochrome), [false, false]);
});

test("changing a saved colour mode archives a new result with the same original, base and consent", async () => {
  for (const monochrome of [false, true]) {
    for (const allowReuse of [false, true]) {
      const { workflow, calls } = modeFixture({ monochrome, canRePair: false });
      const first = await workflow.start(file, { allowReuse });
      const second = await workflow.changeMonochrome(!monochrome);
      assert.notEqual(second.submissionId, first.submissionId);
      assert.strictEqual(second.file, first.file);
      assert.equal(second.allowReuse, allowReuse);
      assert.equal(second.begin.originalId, first.begin.originalId);
      assert.equal(second.begin.base.id, first.begin.base.id);
      assert.notEqual(second.receipt.resultId, first.receipt.resultId);
      assert.equal(first.settings.monochrome, monochrome, "the earlier saved recipe stays unchanged");
      assert.equal(second.settings.monochrome, !monochrome);
      assert.equal(Object.isFrozen(second.settings), true);
      assert.deepEqual({ ...second.settings }, { ...first.settings, monochrome: !monochrome });
      assert.equal(workflow.settings.monochrome, monochrome, "visitor variants do not rewrite the artist default");
      const requests = calls.filter(([type]) => type === "begin").map(([, request]) => request);
      assert.strictEqual(requests[0].originalFile, file);
      assert.deepEqual(JSON.parse(JSON.stringify(requests[1])), {
        submissionId: second.submissionId,
        reuse: { submissionId: first.submissionId, token: first.begin.token, sameBase: true }
      });
      const rendering = calls.filter(([type]) => type === "render")[1][1];
      const archiving = calls.filter(([type]) => type === "complete")[1][1];
      assert.equal(rendering.settings.monochrome, !monochrome);
      assert.strictEqual(rendering.settings, archiving.settings);
      assert.strictEqual(archiving.resultBlob, second.result.blob);
      assert.equal(workflow.pending, false);
    }
  }
});

test("a prepared colour variant archives its exact JPEG after authenticated reuse without rendering again", async () => {
  for (const identity of ["id", "sha256"]) {
    const { workflow, storage, calls } = modeFixture({ canRePair: false });
    if (identity === "sha256") {
      const assign = storage.begin;
      storage.begin = async request => ({ ...await assign(request), base: previewBase() });
    }
    const previous = await workflow.start(file, { allowReuse: true });
    const result = { blob: new Blob([new Uint8Array([255, 216, 255, 4, 217])], { type: "image/jpeg" }), width: 640, height: 480 };
    const base = identity === "id" ? { id: previous.begin.base.id } : { ...previewBase() };
    if (identity === "sha256") delete base.id;
    const variant = await workflow.changeMonochrome(true, { result, base });
    assert.notEqual(variant.submissionId, previous.submissionId);
    assert.equal(calls.filter(([type]) => type === "render").length, 1);
    const beginRequest = calls.filter(([type]) => type === "begin").at(-1)[1];
    assert.deepEqual({ ...beginRequest.reuse }, { submissionId: previous.submissionId, token: previous.begin.token, sameBase: true });
    assert.equal("originalFile" in beginRequest, false);
    const saving = calls.filter(([type]) => type === "complete").at(-1)[1];
    assert.strictEqual(saving.resultBlob, result.blob);
    assert.equal(saving.width, result.width);
    assert.equal(saving.height, result.height);
    assert.equal(saving.settings.monochrome, true);
    assert.equal(Object.isFrozen(saving.settings), true);
    assert.equal(variant.allowReuse, true);
    assert.equal(variant.receipt.baseId, previous.receipt.baseId);
    assert.equal(previous.settings.monochrome, false);
    assert.strictEqual(previous.result.blob, blob);
  }
});

test("invalid prepared JPEGs or mismatched base metadata never replace the saved operation", async () => {
  const fixture = modeFixture();
  const assign = fixture.storage.begin;
  fixture.storage.begin = async request => ({ ...await assign(request), base: previewBase() });
  const saved = await fixture.workflow.start(file);
  const result = { blob, width: 1200, height: 800 };
  const before = fixture.calls.length;
  for (const invalid of [false, {}, { ...result, blob: null },
    { ...result, blob: new Blob([], { type: "image/jpeg" }) },
    { ...result, blob: new Blob(["png"], { type: "image/png" }) },
    { ...result, width: 0 }, { ...result, width: 1.5 }, { ...result, height: -1 }, { ...result, height: "800" }]) {
    await assert.rejects(fixture.workflow.changeMonochrome(true, { result: invalid, base: saved.begin.base }), /prepared exposure/);
    assert.strictEqual(fixture.workflow.operation, saved);
  }
  for (const base of [null, {}, { id: "another-base" }, { sha256: "b".repeat(64) },
    { ...saved.begin.base, id: "another-base" }, { ...saved.begin.base, sha256: "b".repeat(64) },
    { ...saved.begin.base, mimeType: "image/png" }, { ...saved.begin.base, byteLength: 987 },
    { ...saved.begin.base, path: "assets/base-photos/another.jpg" }, { ...saved.begin.base, name: "another.jpg" }]) {
    await assert.rejects(fixture.workflow.changeMonochrome(true, { result, base }), /prepared exposure/);
    assert.strictEqual(fixture.workflow.operation, saved);
  }
  await assert.rejects(fixture.workflow.changeMonochrome(true, { base: saved.begin.base }), /needs a prepared exposure/);
  assert.equal(fixture.calls.length, before);
  assert.equal(fixture.idCount, 1);
  assert.equal(fixture.workflow.pending, false);
});

test("a prepared JPEG cannot archive under a substituted authenticated base and retries its exact pin", async () => {
  const { workflow, storage, calls } = modeFixture();
  const assign = storage.begin;
  storage.begin = async request => ({ ...await assign(request), base: previewBase() });
  const saved = await workflow.start(file);
  const result = { blob, width: 640, height: 480 };
  storage.begin = async request => ({ ...await assign(request), base: { ...previewBase(), sha256: "b".repeat(64) } });
  await assert.rejects(workflow.changeMonochrome(true, { result, base: saved.begin.base }), error =>
    /did not confirm the prepared/.test(error.message) && error.originalSaved && error.resultReady);
  const pending = workflow.operation;
  assert.equal(pending.begin, null);
  assert.strictEqual(pending.result.blob, result.blob);
  assert.equal(calls.filter(([type]) => type === "complete").length, 1);
  assert.equal(calls.filter(([type]) => type === "render").length, 1);
  storage.begin = async request => ({ ...await assign(request), base: previewBase() });
  await workflow.retry();
  assert.strictEqual(workflow.operation, pending);
  assert.equal(calls.filter(([type]) => type === "render").length, 1);
  assert.strictEqual(calls.filter(([type]) => type === "complete").at(-1)[1].resultBlob, result.blob);
});

test("a prepared variant snapshots its JPEG/dimensions and preserves them through a failed archive", async () => {
  const { workflow, storage, calls } = modeFixture();
  const saved = await workflow.start(file);
  const assign = storage.begin, complete = storage.complete;
  const gate = deferred();
  storage.begin = async request => { await gate.promise; return assign(request); };
  const attempts = [];
  storage.complete = async request => { attempts.push(request); throw new Error("response lost"); };
  const exactBlob = new Blob(["prepared JPEG"], { type: "image/jpeg" });
  const result = { blob: exactBlob, width: 640, height: 480 };
  const changing = workflow.changeMonochrome(true, { result, base: { id: saved.begin.base.id } });
  result.blob = blob; result.width = 1; result.height = 1;
  gate.resolve();
  await assert.rejects(changing, error => error.stage === "archive" && error.resultReady);
  const operation = workflow.operation;
  storage.complete = async request => { attempts.push(request); return complete(request); };
  await workflow.retry();
  assert.strictEqual(workflow.operation, operation);
  assert.equal(calls.filter(([type]) => type === "begin").length, 2);
  assert.equal(calls.filter(([type]) => type === "render").length, 1);
  assert.strictEqual(attempts[0].resultBlob, exactBlob);
  assert.strictEqual(attempts[1].resultBlob, exactBlob);
  assert.strictEqual(attempts[0].settings, attempts[1].settings);
  assert.equal(attempts[0].width, 640);
  assert.equal(attempts[1].height, 480);
  assert.equal(attempts[0].submissionId, attempts[1].submissionId);
});

test("another pairing accepts the visible colour mode while preserving the other settings and consent", async () => {
  for (const monochrome of [false, true]) {
    const { workflow, calls } = modeFixture({ monochrome: !monochrome });
    const previous = await workflow.start(file, { allowReuse: true });
    const next = await workflow.rePair({ monochrome });
    assert.deepEqual({ ...next.settings }, { ...previous.settings, monochrome });
    assert.equal(Object.isFrozen(next.settings), true);
    assert.equal(previous.settings.monochrome, !monochrome);
    assert.equal(next.allowReuse, true);
    const rendering = calls.filter(([type]) => type === "render").at(-1)[1];
    const saving = calls.filter(([type]) => type === "complete").at(-1)[1];
    assert.strictEqual(rendering.settings, saving.settings);
    assert.equal(saving.settings.monochrome, monochrome);
    const request = calls.filter(([type]) => type === "begin").at(-1)[1];
    assert.equal("sameBase" in request.reuse, false);
    assert.equal("originalFile" in request, false);
  }
});

test("invalid re-pair colour choices preserve the saved operation without requests or new IDs", async () => {
  const fixture = modeFixture();
  const saved = await fixture.workflow.start(file);
  const before = fixture.calls.length;
  for (const monochrome of [null, 0, 1, "false", {}, []]) {
    await assert.rejects(fixture.workflow.rePair({ monochrome }), /black.and.white/);
    assert.strictEqual(fixture.workflow.operation, saved);
  }
  assert.equal(fixture.calls.length, before);
  assert.equal(fixture.idCount, 1);
});

test("unchanged and invalid saved colour choices do not create another operation", async () => {
  const fixture = modeFixture();
  await assert.rejects(fixture.workflow.changeMonochrome(true), /save.*exposure/i);
  const saved = await fixture.workflow.start(file);
  const count = fixture.calls.length;
  assert.strictEqual(await fixture.workflow.changeMonochrome(false), saved);
  for (const value of [undefined, null, 0, 1, "false", {}, []]) {
    await assert.rejects(fixture.workflow.changeMonochrome(value), /black.and.white|monochrome/i);
    assert.strictEqual(fixture.workflow.operation, saved);
  }
  assert.equal(fixture.calls.length, count);
  assert.equal(fixture.idCount, 1, "neither invalid choices nor no-ops allocate submission IDs");
});

test("a saved colour change cannot overlap another save or replace a pending variant", async () => {
  const { workflow, storage, calls } = modeFixture();
  await workflow.start(file);
  const complete = storage.complete;
  let rejectSave;
  storage.complete = () => new Promise((resolve, reject) => { rejectSave = reject; });
  const saving = workflow.changeMonochrome(true);
  // Let begin and render finish so the new JPEG is waiting for its archive.
  await new Promise(resolve => setImmediate(resolve));
  const pending = workflow.operation;
  for (const value of [false, true]) {
    await assert.rejects(workflow.changeMonochrome(value), /Finish saving|still being saved/);
  }
  await assert.rejects(workflow.rePair(), /Finish saving/);
  assert.strictEqual(workflow.operation, pending);
  rejectSave(new Error("response lost"));
  await assert.rejects(saving, error => error.stage === "archive" && error.resultReady);
  for (const value of [false, true]) {
    await assert.rejects(workflow.changeMonochrome(value), /Finish saving/);
  }
  assert.strictEqual(workflow.operation, pending);
  storage.complete = complete;
  await workflow.retry();
  assert.equal(calls.filter(([type]) => type === "begin").length, 2);
  assert.equal(calls.filter(([type]) => type === "render").length, 2);
  assert.equal(workflow.operation.settings.monochrome, true);
});

test("an uncertain saved colour change retries its identical JPEG and frozen recipe", async () => {
  const { workflow, storage, calls } = modeFixture();
  const original = await workflow.start(file, { allowReuse: true });
  const complete = storage.complete;
  const attempts = [];
  storage.complete = async request => { attempts.push(request); throw new Error("response lost"); };
  await assert.rejects(workflow.changeMonochrome(true), error => error.stage === "archive" && error.originalSaved && error.resultReady);
  const variant = workflow.operation;
  workflow.settings = Object.freeze({ baseExposure: 2, participantExposure: 2, contrast: 30, monochrome: false });
  storage.complete = async request => { attempts.push(request); return complete(request); };
  await workflow.retry();
  assert.equal(calls.filter(([type]) => type === "begin").length, 2, "retry does not choose or upload another source");
  assert.equal(calls.filter(([type]) => type === "render").length, 2, "retry does not regenerate a possibly different JPEG");
  assert.strictEqual(attempts[0].resultBlob, attempts[1].resultBlob);
  assert.strictEqual(attempts[0].settings, attempts[1].settings);
  assert.equal(attempts[0].submissionId, attempts[1].submissionId);
  assert.equal(attempts[0].token, attempts[1].token);
  assert.deepEqual({ ...variant.settings }, { ...original.settings, monochrome: true });
  assert.equal(variant.begin.base.id, original.begin.base.id);
});

test("a lost same-base request retries the same authenticated identity without uploading the original", async () => {
  const { workflow, storage, calls } = modeFixture();
  const saved = await workflow.start(file);
  const beginVariant = storage.begin;
  const attempts = [];
  storage.begin = async request => { attempts.push(request); throw new Error("connection lost"); };
  await assert.rejects(workflow.changeMonochrome(true), /connection lost/);
  const variantId = workflow.operation.submissionId;
  storage.begin = async request => { attempts.push(request); return beginVariant(request); };
  await workflow.retry();
  assert.equal(attempts[0].submissionId, variantId);
  assert.equal(attempts[1].submissionId, variantId);
  assert.deepEqual(JSON.parse(JSON.stringify(attempts[0])), JSON.parse(JSON.stringify(attempts[1])));
  assert.deepEqual({ ...attempts[0].reuse }, { submissionId: saved.submissionId, token: saved.begin.token, sameBase: true });
  assert.equal("originalFile" in attempts[0], false);
  assert.equal("allowReuse" in attempts[0], false);
  assert.equal(calls.filter(([type]) => type === "render").length, 2);
  assert.equal(workflow.operation.begin.base.id, saved.begin.base.id);
  assert.equal(workflow.operation.settings.monochrome, true);
});

test("a failed variant render keeps its assigned base and selected mode for retry", async () => {
  const { workflow, calls } = modeFixture();
  const saved = await workflow.start(file);
  const renderVariant = workflow.render;
  const attempts = [];
  workflow.render = async request => { attempts.push(request); throw new Error("image decoding failed"); };
  await assert.rejects(workflow.changeMonochrome(true), error => error.stage === "develop" && error.originalSaved && !error.resultReady);
  workflow.render = async request => { attempts.push(request); return renderVariant(request); };
  await workflow.retry();
  assert.equal(calls.filter(([type]) => type === "begin").length, 2);
  assert.strictEqual(attempts[0].base, attempts[1].base);
  assert.strictEqual(attempts[0].settings, attempts[1].settings);
  assert.equal(attempts[0].base.id, saved.begin.base.id);
  assert.equal(attempts[0].settings.monochrome, true);
});

test("another pairing after a colour change inherits its mode but requests a different base", async () => {
  const { workflow, calls } = modeFixture();
  await workflow.start(file);
  const variant = await workflow.changeMonochrome(true);
  const next = await workflow.rePair();
  const request = calls.filter(([type]) => type === "begin").at(-1)[1];
  assert.deepEqual({ ...request.reuse }, { submissionId: variant.submissionId, token: variant.begin.token });
  assert.equal("sameBase" in request.reuse, false);
  assert.equal(next.settings.monochrome, true);
  assert.notEqual(next.begin.base.id, variant.begin.base.id);
});

test("another pairing uses a new identity and prior token without another original upload", async () => {
  const requests = [];
  let serial = 0;
  const workflow = new Workflow({
    storage: {
      begin: async (request) => {
        requests.push(["begin", request]);
        return { ...begin(), submissionId: request.submissionId,
          base: { id: serial === 1 ? "base-1" : "base-2", mimeType: "image/jpeg", base64: "AA==" } };
      },
      complete: async (request) => {
        requests.push(["complete", request]);
        return { ...receipt(), submissionId: request.submissionId,
          resultId: `result-${serial}`, baseId: serial === 1 ? "base-1" : "base-2", canRePair: true };
      }
    },
    render: async ({ base }) => { requests.push(["render", base.id]); return { blob, width: 1200, height: 800 }; },
    settings, makeId: () => `submission-${++serial}`
  });
  const first = await workflow.start(file, { allowReuse: true });
  const second = await workflow.rePair();
  assert.notEqual(second.submissionId, first.submissionId);
  assert.equal(second.begin.originalId, first.begin.originalId);
  assert.notEqual(second.receipt.resultId, first.receipt.resultId, "another result is confirmed");
  assert.deepEqual(JSON.parse(JSON.stringify(requests.filter(([type]) => type === "begin")[1][1])), {
    submissionId: second.submissionId,
    reuse: { submissionId: first.submissionId, token: first.begin.token }
  });
  assert.equal(requests.filter(([type]) => type === "render").length, 2);
  assert.equal(requests.filter(([type]) => type === "complete").length, 2);
});

test("another pairing is unavailable until saved and when the archive has no other base", async () => {
  const { workflow, storage } = fixture();
  await assert.rejects(workflow.rePair(), /Create and save/);
  storage.complete = async () => ({ ...receipt(), canRePair: false });
  await workflow.start(file);
  await assert.rejects(workflow.rePair(), /no other photograph/);
});

for (const code of ["NO_ALTERNATIVE_BASE", "BASE_UNAVAILABLE"]) {
  test(`a ${code} pairing failure restores the previous saved result`, async () => {
    let begins = 0;
    let serial = 0;
    const storage = {
      begin: async (request) => {
        if (++begins > 1) throw Object.assign(new Error("No other source"), { code, originalSaved: true });
        return { ...begin(), submissionId: request.submissionId };
      },
      complete: async (request) => ({ ...receipt(), submissionId: request.submissionId, canRePair: true })
    };
    const workflow = new Workflow({ storage,
      render: async () => ({ blob, width: 1200, height: 800 }),
      settings, makeId: () => `submission-${++serial}` });
    const saved = await workflow.start(file);
    await assert.rejects(workflow.rePair(), (error) => error.code === code && error.previousResultRestored === true);
    assert.strictEqual(workflow.operation, saved);
    assert.equal(workflow.pending, false);
    assert.equal(workflow.operation.receipt.saved, true);
  });
}

test("a new pairing with an assigned base stays pending if its render fails", async () => {
  let serial = 0;
  let renders = 0;
  const workflow = new Workflow({
    storage: {
      begin: async (request) => ({ ...begin(), submissionId: request.submissionId }),
      complete: async (request) => ({ ...receipt(), submissionId: request.submissionId, canRePair: true })
    },
    render: async () => {
      if (++renders === 2) throw new Error("Development failed");
      return { blob, width: 1200, height: 800 };
    },
    settings, makeId: () => `submission-${++serial}`
  });
  const previous = await workflow.start(file);
  await assert.rejects(workflow.rePair(), (error) => error.stage === "develop" && !error.previousResultRestored);
  assert.notStrictEqual(workflow.operation, previous);
  assert.equal(workflow.pending, true);
  assert.ok(workflow.operation.begin?.base);
});

test("an uncertain original upload retries the same submission identity", async () => {
  const { workflow, calls, storage } = fixture({ storage: { begin: async () => { throw new Error("connection lost"); } } });
  await assert.rejects(workflow.start(file), (error) => error.stage === "original" && !error.originalSaved);
  assert.equal(workflow.pending, true);
  assert.equal(calls.some(([type]) => type === "render"), false);
  storage.begin = async (request) => { assert.equal(request.submissionId, id); assert.strictEqual(request.originalFile, file); return begin(); };
  await workflow.retry();
  assert.equal(workflow.operation.submissionId, id);
  assert.equal(workflow.pending, false);
});

test("an archive failure retries the identical JPEG without generating a different exposure", async () => {
  const requests = [];
  const { workflow, calls, storage } = fixture({ storage: { complete: async (request) => { requests.push(request); throw new Error("response lost"); } } });
  await assert.rejects(workflow.start(file), (error) => error.stage === "archive" && error.originalSaved && error.resultReady);
  assert.equal(workflow.operation.receipt, null);
  storage.complete = async (request) => { requests.push(request); return receipt(); };
  await workflow.retry();
  assert.equal(calls.filter(([type]) => type === "render").length, 1);
  assert.equal(calls.filter(([type]) => type === "begin").length, 1);
  assert.strictEqual(requests[0].resultBlob, requests[1].resultBlob);
  assert.equal(requests[0].submissionId, requests[1].submissionId);
  assert.equal(requests[0].token, requests[1].token);
});

test("false or mismatched receipts never report success", async () => {
  for (const changed of [{ saved: false }, { submissionId: "other" }, { originalId: "other" }, { baseId: "other" }, { resultId: "" }]) {
    const { workflow, calls } = fixture({ storage: { complete: async () => ({ ...receipt(), ...changed }) } });
    await assert.rejects(workflow.start(file), /did not confirm/);
    assert.equal(workflow.pending, true);
    assert.equal(workflow.operation.receipt, null);
    assert.equal(calls.some(([type, stage]) => type === "stage" && stage === "saved"), false);
  }
});

test("a failed render keeps the selected base and saved original for retry", async () => {
  let attempts = 0;
  const { workflow, calls } = fixture({ render: async (request) => {
    assert.equal(request.base.id, "base-1");
    if (++attempts === 1) throw new Error("image decoding failed");
    return { blob, width: 1200, height: 800 };
  } });
  await assert.rejects(workflow.start(file), (error) => error.originalSaved && error.stage === "develop");
  await workflow.retry();
  assert.equal(calls.filter(([type]) => type === "begin").length, 1);
  assert.equal(attempts, 2);
});

test("NO_BASE retains the backend's original-saved status for a later retry", async () => {
  const failure = Object.assign(new Error("no base"), { code: "NO_BASE", originalSaved: true });
  const { workflow, storage } = fixture({ storage: { begin: async () => { throw failure; } } });
  await assert.rejects(workflow.start(file), (error) => error.originalSaved && error.code === "NO_BASE");
  storage.begin = async () => begin();
  await workflow.retry();
  assert.equal(workflow.operation.receipt.saved, true);
});

test("another upload cannot discard a result that is waiting for its archive", async () => {
  const { workflow } = fixture({ storage: { complete: async () => { throw new Error("offline"); } } });
  await assert.rejects(workflow.start(file));
  const pending = workflow.operation;
  await assert.rejects(workflow.start(new Blob(["other"])), /Finish saving/);
  assert.strictEqual(workflow.operation, pending);
  assert.strictEqual(workflow.operation.result.blob, blob);
});

test("overlapping retry calls cannot duplicate an in-flight save", async () => {
  let resolveBegin;
  const { workflow } = fixture({ storage: { begin: () => new Promise((resolve) => { resolveBegin = resolve; }) } });
  const first = workflow.start(file);
  await assert.rejects(workflow.retry(), /still being saved/);
  resolveBegin(begin());
  await first;
  assert.equal(workflow.pending, false);
});
