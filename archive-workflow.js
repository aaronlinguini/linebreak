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

  async start(file, { allowReuse = false, monochrome = this.settings.monochrome, previewBase = null } = {}) {
    if (this.busy || this.pending) throw new Error("Finish saving this photograph before adding another.");
    if (typeof allowReuse !== "boolean") throw new Error("The photograph sharing choice is invalid.");
    if (typeof monochrome !== "boolean") throw new Error("The black-and-white choice is invalid.");
    if (previewBase && ((!previewBase.id && !previewBase.path) || typeof previewBase.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(previewBase.sha256) ||
        !previewBase.mimeType || !Number.isSafeInteger(previewBase.byteLength) || previewBase.byteLength < 1 ||
        previewBase.base64 !== undefined)) throw new Error("The preview photograph is invalid.");
    // Save these settings with this exposure so retries cannot change them.
    const settings = Object.freeze({ ...this.settings, monochrome });
    this.operation = { submissionId: this.makeId(), file, allowReuse, settings,
      reuse: null, previewBase: previewBase ? Object.freeze({ ...previewBase }) : null,
      begin: null, result: null, receipt: null };
    return this.run();
  }

  async rePair({ monochrome = this.operation?.settings.monochrome } = {}) {
    if (this.busy || this.pending) throw new Error("Finish saving this photograph before trying another pairing.");
    const previous = this.operation;
    if (!previous?.receipt || !previous.begin?.token) throw new Error("Create and save an exposure first.");
    if (typeof monochrome !== "boolean") throw new Error("The black-and-white choice is invalid.");
    if (previous.receipt.canRePair === false) throw new Error("There is no other photograph available to pair right now.");
    this.operation = { submissionId: this.makeId(), file: previous.file,
      allowReuse: previous.allowReuse, settings: Object.freeze({ ...previous.settings, monochrome }),
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

  async changeMonochrome(monochrome, { result = null, base = null } = {}) {
    if (typeof monochrome !== "boolean") throw new Error("The black-and-white choice is invalid.");
    if (this.busy || this.pending) throw new Error("Finish saving this photograph before changing its colour mode.");
    const previous = this.operation;
    if (!previous?.receipt || !previous.begin?.token) throw new Error("Save an exposure before changing its colour mode.");
    if (result !== null && (!this.validResult(result) || !this.matchesBase(previous.begin.base, base))) {
      throw new Error("The prepared exposure or its photograph pairing is invalid.");
    }
    if (result === null && base !== null) throw new Error("A photograph pairing needs a prepared exposure.");
    if (previous.settings.monochrome === monochrome) return previous;
    this.operation = { submissionId: this.makeId(), file: previous.file,
      allowReuse: previous.allowReuse,
      settings: Object.freeze({ ...previous.settings, monochrome }),
      reuse: { submissionId: previous.submissionId, token: previous.begin.token, sameBase: true },
      resultBase: result !== null ? Object.freeze({ ...previous.begin.base }) : null,
      begin: null, result: result !== null ? { ...result } : null, receipt: null };
    return this.run();
  }

  validResult(result) {
    return result?.blob?.type === "image/jpeg" && Number.isFinite(result.blob.size) && result.blob.size > 0 &&
      Number.isInteger(result.width) && result.width > 0 && Number.isInteger(result.height) && result.height > 0;
  }

  matchesBase(expected, actual) {
    if (!expected || !actual) return false;
    const sameId = typeof expected.id === "string" && expected.id.length > 0 && actual.id === expected.id;
    const sameHash = typeof expected.sha256 === "string" && /^[0-9a-f]{64}$/.test(expected.sha256) && actual.sha256 === expected.sha256;
    return (sameId || sameHash) && !["id", "name", "mimeType", "sha256", "byteLength", "path"].some(key =>
      expected[key] !== undefined && actual[key] !== undefined && expected[key] !== actual[key]);
  }

  async retry() {
    if (!this.pending) throw new Error("There is no photograph waiting to be saved.");
    return this.run();
  }

  async develop(operation, base) {
    const result = await this.render({ file: operation.file, base,
      submissionId: operation.submissionId, settings: operation.settings });
    if (!this.validResult(result)) {
      throw new Error("The exposure could not be developed. Please retry.");
    }
    operation.result = result;
    this.onProgress({ stage: "preview" });
  }

  async run() {
    if (this.busy) throw new Error("This photograph is still being saved.");
    this.busy = true;
    const operation = this.operation;
    let stage = operation.reuse ? "pairing" : "original";
    try {
      // Asset development can finish while Google receives and saves the original.
      // Capture errors immediately, and settle both tasks before allowing a retry.
      const earlyRender = !operation.result && operation.previewBase?.path
        ? this.develop(operation, operation.previewBase).then(() => null, error => error) : null;
      if (!operation.begin) {
        this.onProgress({ stage });
        try {
          const begin = await this.storage.begin({ submissionId: operation.submissionId,
            ...(operation.reuse ? { reuse: operation.reuse } : { originalFile: operation.file, allowReuse: operation.allowReuse }),
            ...(operation.previewBase ? { preferredBaseSha256: operation.previewBase.sha256 } : {}) });
          if (begin.submissionId !== operation.submissionId || !begin.token || !begin.originalId ||
              !begin.base?.id || !begin.base.mimeType || Boolean(begin.base.base64) === Boolean(begin.base.path)) {
            throw new Error("The collection did not confirm the photograph. Please retry.");
          }
          if (operation.previewBase && ["id", "name", "mimeType", "sha256", "byteLength", "path"].some(key =>
            operation.previewBase[key] !== undefined && operation.previewBase[key] !== begin.base[key])) {
            throw new Error("The collection did not confirm the preview photograph. Please retry.");
          }
          if (operation.resultBase && !this.matchesBase(operation.resultBase, begin.base)) {
            throw Object.assign(new Error("The collection did not confirm the prepared photograph pairing. Please retry."), {
              originalSaved: begin.originalRetained !== false && Boolean(begin.originalId)
            });
          }
          operation.begin = begin;
        } catch (error) {
          if (earlyRender) await earlyRender;
          throw error;
        }
      }

      stage = "develop";
      if (earlyRender) {
        const error = await earlyRender;
        if (error) throw error;
      }
      if (!operation.result) {
        this.onProgress({ stage });
        await this.develop(operation, operation.begin.base);
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
      failure.originalSaved = operation.begin?.originalRetained === false
        ? false : Boolean(operation.begin?.originalId || failure.originalSaved);
      failure.resultReady = Boolean(operation.result);
      failure.stage = stage;
      throw failure;
    } finally {
      this.busy = false;
    }
  }
}
