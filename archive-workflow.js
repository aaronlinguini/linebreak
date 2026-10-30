"use strict";

// Keep the same photo, base and result when retrying a save.
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

  async start(file, { allowReuse = false, monochrome = this.settings.monochrome } = {}) {
    if (this.busy || this.pending) throw new Error("Finish saving this photograph before adding another.");
    if (typeof allowReuse !== "boolean") throw new Error("The photograph sharing choice is invalid.");
    if (typeof monochrome !== "boolean") throw new Error("The black-and-white choice is invalid.");
    // Save these settings with this exposure so retries cannot change them.
    const settings = Object.freeze({ ...this.settings, monochrome });
    this.operation = { submissionId: this.makeId(), file, allowReuse, settings,
      reuse: null, begin: null, result: null, receipt: null };
    return this.run();
  }

  async rePair() {
    if (this.busy || this.pending) throw new Error("Finish saving this photograph before trying another pairing.");
    const previous = this.operation;
    if (!previous?.receipt || !previous.begin?.token) throw new Error("Create and save an exposure first.");
    if (previous.receipt.canRePair === false) throw new Error("There is no other photograph available to pair right now.");
    this.operation = { submissionId: this.makeId(), file: previous.file,
      allowReuse: previous.allowReuse, settings: previous.settings,
      reuse: { submissionId: previous.submissionId, token: previous.begin.token },
      begin: null, result: null, receipt: null };
    try {
      return await this.run();
    } catch (error) {
      // If no new base was found, keep the previous saved result.
      if (["NO_ALTERNATIVE_BASE", "BASE_UNAVAILABLE"].includes(error.code) &&
          !this.operation.begin && !this.operation.result) {
        this.operation = previous;
        error.previousResultRestored = true;
      }
      throw error;
    }
  }

  async retry() {
    if (!this.pending) throw new Error("There is no photograph waiting to be saved.");
    return this.run();
  }

  async run() {
    if (this.busy) throw new Error("This photograph is still being saved.");
    this.busy = true;
    const operation = this.operation;
    let stage = operation.reuse ? "pairing" : "original";
    try {
      if (!operation.begin) {
        this.onProgress({ stage });
        const begin = await this.storage.begin({ submissionId: operation.submissionId,
          ...(operation.reuse ? { reuse: operation.reuse } : { originalFile: operation.file, allowReuse: operation.allowReuse }) });
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
          submissionId: operation.submissionId, settings: operation.settings
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
        height: operation.result.height, settings: operation.settings
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
