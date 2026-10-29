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

function fixture(overrides = {}) {
  const calls = [];
  const storage = {
    begin: async (request) => { calls.push(["begin", request]); return begin(); },
    complete: async (request) => { calls.push(["complete", request]); return receipt(); },
    ...overrides.storage
  };
  const render = overrides.render || (async (request) => { calls.push(["render", request]); return { blob, width: 1200, height: 800 }; });
  const workflow = new Workflow({ storage, render, settings, makeId: () => id, onProgress: ({ stage }) => calls.push(["stage", stage]) });
  return { workflow, calls, storage };
}

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
