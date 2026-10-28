"use strict";

// Keeps a submission's identity, selected base, and exact result through retries.
// An exposure is complete only after the archive acknowledges that same result.
class ExposureArchiveWorkflow {
  constructor({ storage, render, settings, onProgress = () => {}, makeId = () => crypto.randomUUID() }) {
    this.storage = storage;
    this.render = render;
    this.settings = Object.freeze({ ...settings });
    this.onProgress = onProgress;
    this.makeId = makeId;
    this.operation = null;
    this.busy = false;
  }

  get pending() { return Boolean(this.operation && !this.operation.receipt); }

  async start(file) {
    if (this.busy || this.pending) throw new Error("Finish saving this photograph before adding another.");
    this.operation = { submissionId: this.makeId(), file, begin: null, result: null, receipt: null };
    return this.run();
  }

  async retry() {
    if (!this.pending) throw new Error("There is no photograph waiting to be saved.");
    return this.run();
  }

  async run() {
    if (this.busy) throw new Error("This photograph is still being saved.");
    this.busy = true;
    const operation = this.operation;
    let stage = "original";
    try {
      if (!operation.begin) {
        this.onProgress({ stage });
        const begin = await this.storage.begin({ submissionId: operation.submissionId, originalFile: operation.file });
        if (begin.submissionId !== operation.submissionId || !begin.token || !begin.originalId ||
            !begin.base?.id || !begin.base.mimeType || !begin.base.base64) {
          throw new Error("The collection did not confirm the photograph. Please retry.");
        }
        operation.begin = begin;
      }

      stage = "develop";
      if (!operation.result) {
        this.onProgress({ stage });
        const result = await this.render({
          file: operation.file, base: operation.begin.base,
          submissionId: operation.submissionId, settings: this.settings
        });
        if (!result?.blob || result.blob.type !== "image/jpeg" || result.blob.size === 0 ||
            !Number.isInteger(result.width) || result.width < 1 ||
            !Number.isInteger(result.height) || result.height < 1) {
          throw new Error("The exposure could not be developed. Please retry.");
        }
        operation.result = result;
      }

      stage = "archive";
      this.onProgress({ stage });
      const receipt = await this.storage.complete({
        submissionId: operation.submissionId, token: operation.begin.token,
        resultBlob: operation.result.blob, width: operation.result.width,
        height: operation.result.height, settings: this.settings
      });
      if (receipt.saved !== true || receipt.submissionId !== operation.submissionId ||
          receipt.originalId !== operation.begin.originalId || receipt.baseId !== operation.begin.base.id ||
          typeof receipt.resultId !== "string" || !receipt.resultId) {
        throw new Error("The archive did not confirm the exposure. Please retry saving.");
      }
      operation.receipt = receipt;
      this.onProgress({ stage: "saved" });
      return operation;
    } catch (error) {
      const failure = error instanceof Error ? error : new Error("The photograph could not be saved.");
      failure.originalSaved = Boolean(operation.begin?.originalId || failure.originalSaved);
      failure.resultReady = Boolean(operation.result);
      failure.stage = stage;
      throw failure;
    } finally {
      this.busy = false;
    }
  }
}
