"use strict";

function createExposureContributionHistory({ storage } = {}) {
  const key = "line-break.contributions.v1";
  const remembered = new Set();
  const normalize = hash => typeof hash === "string" && /^[0-9a-f]{64}$/i.test(hash) ? hash.toLowerCase() : null;

  function mergeStored() {
    let target, serialized;
    try {
      target = storage === undefined ? window.localStorage : storage;
      if (!target || typeof target.getItem !== "function") return null;
      serialized = target.getItem(key);
    } catch { return null; }
    try {
      const hashes = JSON.parse(serialized);
      if (Array.isArray(hashes)) for (const value of hashes) {
        const hash = normalize(value);
        if (hash) remembered.add(hash);
      }
    } catch { /* Keep this page's hashes when browser storage is unavailable or corrupt. */ }
    return target;
  }

  return Object.freeze({
    remember(value) {
      const hash = normalize(value);
      if (!hash) throw new Error("The uploaded photograph's fingerprint is invalid.");
      const target = mergeStored();
      remembered.add(hash);
      try { target?.setItem(key, JSON.stringify(Array.from(remembered))); }
      catch { /* A denied or full browser store must not interrupt development. */ }
      return hash;
    },
    hashes() {
      mergeStored();
      return Array.from(remembered);
    }
  });
}

// Add the light from both photos, then limit it to the display range.
const ExposureMath = (() => {
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const srgbToLinear = (value) => value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
  const linearToSrgb = (value) => value <= 0.0031308
    ? value * 12.92
    : 1.055 * value ** (1 / 2.4) - 0.055;

  // Increase contrast without moving pure black or white.
  function contrastCurve(value, amount) {
    if (amount === 0 || value <= 0 || value >= 1) return value;
    const power = 2 ** (amount / 50);
    const a = value ** power;
    return a / (a + (1 - value) ** power);
  }

  function coverCrop(sourceWidth, sourceHeight, targetWidth, targetHeight) {
    const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
    const width = targetWidth / scale;
    const height = targetHeight / scale;
    return { x: (sourceWidth - width) / 2, y: (sourceHeight - height) / 2, width, height };
  }

  function outputSize(width, height, maxEdge) {
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  }

  function selectIndex(length, mode, currentIndex, nextSequenceIndex, randomValue = Math.random()) {
    if (length < 1) return -1;
    if (mode === "sequence") return nextSequenceIndex % length;
    if (length === 1) return 0;
    if (currentIndex < 0) return Math.min(length - 1, Math.floor(randomValue * length));
    const choice = Math.min(length - 2, Math.floor(randomValue * (length - 1)));
    return choice >= currentIndex ? choice + 1 : choice;
  }

  const linearTable = Float64Array.from({ length: 256 }, (_, index) => srgbToLinear(index / 255));
  function makeEncoder(contrast) {
    return Uint8ClampedArray.from({ length: 65536 }, (_, index) =>
      Math.round(clamp(contrastCurve(linearToSrgb(index / 65535), contrast)) * 255));
  }

  function createMixer(settings) {
    const baseGain = 2 ** settings.baseExposure;
    const participantGain = 2 ** settings.participantExposure;
    const encode = makeEncoder(settings.contrast);

    return function mix(base, participant, output, start = 0, end = base.length) {
      for (let index = start; index < end; index += 4) {
        let red = linearTable[base[index]] * baseGain + linearTable[participant[index]] * participantGain;
        let green = linearTable[base[index + 1]] * baseGain + linearTable[participant[index + 1]] * participantGain;
        let blue = linearTable[base[index + 2]] * baseGain + linearTable[participant[index + 2]] * participantGain;
        if (settings.monochrome) red = green = blue = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        // Clip each colour separately so white stays white.
        output[index] = encode[Math.round(clamp(red) * 65535)];
        output[index + 1] = encode[Math.round(clamp(green) * 65535)];
        output[index + 2] = encode[Math.round(clamp(blue) * 65535)];
        output[index + 3] = 255;
      }
    };
  }

  const balancedParameters = Object.freeze({ maximumPower: 4 });
  function createBalancedMixer({ baseExposure = 0, participantExposure = 0, contrast = 12, monochrome = false, balanceStrength = 100 } = {}) {
    if (![baseExposure, participantExposure].every((value) => Number.isFinite(value) && value >= -3 && value <= 2)) {
      throw new RangeError("Each exposure must be between -3 and +2 EV.");
    }
    if (!Number.isFinite(contrast) || contrast < 0 || contrast > 30) throw new RangeError("Contrast must be between 0 and 30.");
    if (!Number.isFinite(balanceStrength) || balanceStrength < 0 || balanceStrength > 100) throw new RangeError("Balance must be between 0 and 100.");
    if (typeof monochrome !== "boolean") throw new TypeError("Monochrome must be true or false.");
    const settings = { baseExposure, participantExposure, contrast, monochrome };
    // At zero, use the unchanged Current mixer.
    const additive = balanceStrength === 0 ? createMixer(settings) : null;
    const strength = balanceStrength / 100;
    const power = 1 + (balancedParameters.maximumPower - 1) * strength;
    const gainA = 2 ** baseExposure;
    const gainB = 2 ** participantExposure;
    const encode = additive ? null : makeEncoder(contrast);
    const encodeLight = (value) => encode[Math.round(clamp(value) * 65535)];
    function combineLight(a, b) {
      const brighter = Math.max(a, b);
      const darker = Math.min(a, b);
      if (brighter === 0) return 0;
      // Higher values favour the brighter input and reduce overlap.
      return brighter * (1 + (darker / brighter) ** power) ** (1 / power);
    }
    return function mix(base, participant, output, start = 0, end = base.length) {
      if (base.length !== participant.length || base.length !== output.length || base.length % 4 !== 0) {
        throw new RangeError("Input and output buffers must have identical RGBA dimensions.");
      }
      if (!Number.isInteger(start) || !Number.isInteger(end) || start % 4 !== 0 || end % 4 !== 0 || start < 0 || end < start || end > base.length) {
        throw new RangeError("Pixel chunks must use aligned RGBA boundaries within the buffers.");
      }
      if (additive) { additive(base, participant, output, start, end); return; }
      for (let index = start; index < end; index += 4) {
        const ar = linearTable[base[index]] * gainA, ag = linearTable[base[index + 1]] * gainA, ab = linearTable[base[index + 2]] * gainA;
        const br = linearTable[participant[index]] * gainB, bg = linearTable[participant[index + 1]] * gainB, bb = linearTable[participant[index + 2]] * gainB;
        const red = combineLight(ar, br);
        const green = combineLight(ag, bg);
        const blue = combineLight(ab, bb);
        if (monochrome) {
          // Mix the colours before converting to grayscale to keep their detail.
          const grey = encodeLight(0.2126 * red + 0.7152 * green + 0.0722 * blue);
          output[index] = output[index + 1] = output[index + 2] = grey;
        } else {
          output[index] = encodeLight(red);
          output[index + 1] = encodeLight(green);
          output[index + 2] = encodeLight(blue);
        }
        output[index + 3] = 255;
      }
    };
  }

  return Object.freeze({ clamp, srgbToLinear, linearToSrgb, contrastCurve, coverCrop, outputSize, selectIndex, createMixer, createBalancedMixer, balancedVersion: "overlap-suppression-v2", balancedParameters });
})();

// Starting settings for new exposures.
const PROJECT_SETTINGS = Object.freeze({
  baseExposure: 0, participantExposure: 0, contrast: 12,
  monochrome: typeof EXPOSURE_CONFIG !== "undefined" && EXPOSURE_CONFIG.forceBlackAndWhite === true
});

function createExposureProcessor({ mixerFactory = ExposureMath.createMixer } = {}) {
  const MAX_BYTES = 30 * 1024 * 1024;
  const SOURCE_EDGE = 2400;
  const nextFrame = () => new Promise((resolve) => {
    if (typeof MessageChannel !== "function") { setTimeout(resolve, 0); return; }
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
  const context = (canvas) => {
    const result = canvas.getContext("2d", { willReadFrequently: true, colorSpace: "srgb" });
    if (!result) throw new Error("This browser cannot process the photograph.");
    return result;
  };
  async function loadPhoto(file) {
    if (file.size > MAX_BYTES) throw new Error(`“${file.name}” is larger than 30 MB. Export a smaller JPEG or PNG and try again.`);
    const supportedType = /^image\/(jpeg|png|webp|avif)$/i.test(file.type);
    const supportedName = /\.(jpe?g|png|webp|avif)$/i.test(file.name);
    if (file.type ? !supportedType : !supportedName) {
      throw new Error(`“${file.name}” is not a supported photo. Choose JPEG, PNG, WebP, or AVIF. Export HEIC and RAW files as JPEG first.`);
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 80000000) {
        throw new Error("This photograph is too large to process safely. Export a smaller version and try again.");
      }
      // The browser has applied the photo's orientation. Rotate portraits.
      const portrait = image.naturalHeight > image.naturalWidth;
      const dimensions = ExposureMath.outputSize(
        portrait ? image.naturalHeight : image.naturalWidth,
        portrait ? image.naturalWidth : image.naturalHeight,
        SOURCE_EDGE
      );
      const source = document.createElement("canvas");
      source.width = dimensions.width;
      source.height = dimensions.height;
      const sourceContext = context(source);
      // Treat transparent areas as black (no exposure).
      sourceContext.fillStyle = "#000";
      sourceContext.fillRect(0, 0, source.width, source.height);
      if (portrait) {
        sourceContext.save();
        sourceContext.translate(source.width, 0);
        sourceContext.rotate(Math.PI / 2);
        sourceContext.drawImage(image, 0, 0, source.height, source.width);
        sourceContext.restore();
      } else sourceContext.drawImage(image, 0, 0, source.width, source.height);
      const thumbnail = document.createElement("canvas");
      const thumbnailSize = ExposureMath.outputSize(source.width, source.height, 320);
      thumbnail.width = thumbnailSize.width;
      thumbnail.height = thumbnailSize.height;
      context(thumbnail).drawImage(source, 0, 0, thumbnail.width, thumbnail.height);
      // Process a smaller copy; keep the uploaded original unchanged.
      const blob = await new Promise((resolve) => source.toBlob(resolve, "image/jpeg", 0.97));
      if (!blob) throw new Error("The browser could not prepare this photograph.");
      const thumbnailUrl = thumbnail.toDataURL("image/jpeg", 0.85);
      source.width = source.height = thumbnail.width = thumbnail.height = 1;
      return {
        name: file.name, blob,
        width: dimensions.width, height: dimensions.height, thumbnail: thumbnailUrl,
        originalWidth: image.naturalWidth, originalHeight: image.naturalHeight
      };
    } catch (error) {
      if (error instanceof Error && /too large/.test(error.message)) throw error;
      throw new Error(`“${file.name}” could not be read. Try exporting it as a JPEG or PNG.`);
    } finally { URL.revokeObjectURL(url); }
  }
  function releasePhoto(photo) {
    if (!photo) return;
    photo.blob = null;
    photo.thumbnail = "";
  }
  async function decodeSource(photo) {
    if (typeof createImageBitmap === "function") return createImageBitmap(photo.blob);
    const url = URL.createObjectURL(photo.blob);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    } finally { URL.revokeObjectURL(url); }
  }
  async function alignPhotos(basePhoto, participantPhoto, maxEdge) {
    const base = { ...basePhoto };
    const participant = { ...participantPhoto };
    // Fit both full photos. Black padding adds no light.
    const baseSize = ExposureMath.outputSize(base.width, base.height, maxEdge);
    const participantFitScale = Math.min(baseSize.width / participant.width, baseSize.height / participant.height);
    const scale = Math.min(1, 1 / participantFitScale);
    const width = Math.max(1, Math.floor(baseSize.width * scale));
    const height = Math.max(1, Math.floor(baseSize.height * scale));
    const scratch = document.createElement("canvas");
    scratch.width = width;
    scratch.height = height;
    const scratchContext = context(scratch);
    function drawFullPhoto(photo, image) {
      const fit = Math.min(width / photo.width, height / photo.height, 1);
      const drawWidth = photo.width * fit;
      const drawHeight = photo.height * fit;
      scratchContext.fillStyle = "#000";
      scratchContext.fillRect(0, 0, width, height);
      scratchContext.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    }
    let source;
    try {
      source = await decodeSource(base);
      drawFullPhoto(base, source);
      source.close?.();
      source = null;
      const basePixels = scratchContext.getImageData(0, 0, width, height);
      source = await decodeSource(participant);
      drawFullPhoto(participant, source);
      const participantPixels = scratchContext.getImageData(0, 0, width, height);
      return { width, height, base: basePixels.data, participant: participantPixels.data };
    } finally {
      source?.close?.();
      scratch.width = scratch.height = 1;
    }
  }
  async function processPixels(pair, settings) {
    const result = new ImageData(pair.width, pair.height);
    const mix = mixerFactory(settings);
    // Let the browser respond between pixel batches.
    const chunk = 65536 * 4;
    for (let start = 0; start < result.data.length; start += chunk) {
      mix(pair.base, pair.participant, result.data, start, Math.min(result.data.length, start + chunk));
      if (start + chunk < result.data.length) await nextFrame();
    }
    return result;
  }
  async function develop(basePhoto, participantPhoto, canvas, settings = PROJECT_SETTINGS) {
    const pair = await alignPhotos(basePhoto, participantPhoto, SOURCE_EDGE);
    const pixels = await processPixels(pair, settings);
    canvas.width = pair.width;
    canvas.height = pair.height;
    context(canvas).putImageData(pixels, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
    if (!blob) throw new Error("The exposure could not be created. Please retry.");
    return { blob, width: pair.width, height: pair.height };
  }

  return Object.freeze({ loadPhoto, releasePhoto, develop });
}

// Finish the export before replacing the visible image.
async function rotateExposureCanvas(canvas, quarterTurns = 1) {
  if (!Number.isInteger(quarterTurns) || quarterTurns < 0 || quarterTurns > 3) {
    throw new RangeError("Rotation must use zero to three clockwise quarter turns.");
  }
  const width = canvas.width;
  const height = canvas.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError("There is no finished image to rotate.");
  }
  const visibleContext = canvas.getContext("2d");
  if (!visibleContext) throw new Error("This browser cannot rotate the image.");
  const source = visibleContext.getImageData(0, 0, width, height).data;
  const rotatedWidth = quarterTurns % 2 ? height : width;
  const rotatedHeight = quarterTurns % 2 ? width : height;
  const pixels = new ImageData(rotatedWidth, rotatedHeight);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = quarterTurns === 1 ? height - 1 - y : quarterTurns === 2 ? width - 1 - x : quarterTurns === 3 ? y : x;
      const dy = quarterTurns === 1 ? x : quarterTurns === 2 ? height - 1 - y : quarterTurns === 3 ? width - 1 - x : y;
      const from = (y * width + x) * 4;
      const to = (dy * rotatedWidth + dx) * 4;
      for (let channel = 0; channel < 4; channel++) pixels.data[to + channel] = source[from + channel];
    }
  }
  const prepared = document.createElement("canvas");
  prepared.width = rotatedWidth;
  prepared.height = rotatedHeight;
  try {
    const preparedContext = prepared.getContext("2d");
    if (!preparedContext) throw new Error("This browser cannot rotate the image.");
    preparedContext.putImageData(pixels, 0, 0);
    const blob = await new Promise((resolve) => prepared.toBlob(resolve, "image/jpeg", 0.95));
    if (!blob) throw new Error("The rotated image could not be created. Please retry.");
    canvas.width = rotatedWidth;
    canvas.height = rotatedHeight;
    visibleContext.putImageData(pixels, 0, 0);
    return { blob, width: rotatedWidth, height: rotatedHeight };
  } finally { prepared.width = prepared.height = 1; }
}

async function prepareParticipantFile(file, loadHeic = () => import("./heic-input.js")) {
  if (!/^image\/hei[cf](?:-sequence)?$/i.test(file.type) && !/\.(heic|heif)$/i.test(file.name || "")) return file;
  if (file.size > 30 * 1024 * 1024) throw new Error("Choose a HEIC photo smaller than 30 MB.");
  const { normalizeHeic } = await loadHeic();
  return normalizeHeic(file);
}

async function saveExposureImage(blob, url, filename) {
  let fallbackUrl;
  const mobile = typeof navigator !== "undefined" && (
    navigator.userAgentData?.mobile === true || /Android|iPhone|iPad|iPod/.test(navigator.userAgent || "") ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
  if (mobile && blob && typeof File === "function" &&
      typeof navigator.canShare === "function" && typeof navigator.share === "function") {
    let shareData;
    try {
      const file = new File([blob], filename, { type: "image/jpeg" });
      if (navigator.canShare({ files: [file] })) shareData = { files: [file] };
    } catch { /* Unsupported file sharing uses the download link. */ }
    if (shareData) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
        fallbackUrl = URL.createObjectURL(blob);
      }
    }
  }
  const link = document.createElement("a");
  link.href = fallbackUrl || url;
  link.download = filename;
  document.body.append(link);
  try { link.click(); }
  finally {
    link.remove();
    // Keep the fallback alive while the browser starts reading its download.
    if (fallbackUrl) setTimeout(() => URL.revokeObjectURL(fallbackUrl), 60000);
  }
}

function initializeExposureStudio() {
  const byId = (id) => document.getElementById(id);
  const ui = {
    workspace: byId("workspace"), canvas: byId("canvas"),
    resultEmpty: byId("result-empty"), sourceActions: byId("source-actions"),
    exposureControls: byId("exposure-controls"), uploadInstructions: byId("upload-instructions"),
    uploadActions: byId("upload-actions"), nextPhotoNote: byId("next-photo-note"),
    outputOptions: byId("output-options"), monochrome: byId("visitor-monochrome"),
    colour: byId("visitor-colour"), repeatActions: byId("repeat-actions"),
    resultActions: byId("result-actions"), allowReuse: byId("allow-reuse"), declineReuse: byId("decline-reuse"), artistOnly: byId("artist-only"), sharedLibrary: byId("shared-library"),
    newPairing: byId("new-pairing-button"), reset: byId("reset-button"),
    participantInput: byId("participant-input"), cameraInput: byId("participant-camera-input"),
    cameraPicker: byId("camera-picker"), cameraSeparator: byId("camera-separator"),
    cameraInstructions: byId("camera-instructions"), pickerSingular: byId("picker-singular"),
    pickerPlural: byId("picker-plural"),
    download: byId("download-button"), rotate: byId("rotate-button"), retry: byId("retry-button"),
    status: byId("status"), error: byId("error"), busy: byId("busy-indicator"), savingNote: byId("upload-again-note")
  };
  const supportsCapture = "capture" in ui.cameraInput;
  ui.cameraPicker.hidden = !supportsCapture;
  ui.cameraSeparator.hidden = !supportsCapture;
  ui.cameraInstructions.hidden = !supportsCapture;
  ui.pickerSingular.hidden = supportsCapture;
  ui.pickerPlural.hidden = !supportsCapture;
  const developingMessage = ui.busy.textContent;
  const savingMessage = ui.savingNote.textContent.trim();
  const state = { working: false, connecting: false, ready: false, hasResult: false, participant: null,
    selectedFile: null, selectedHash: null, selectionChoices: null, nextPhotoConsent: undefined, poolChoice: false, queued: false, downloadUrl: null, downloadBlob: null, rePairUnavailable: false,
    displayedSubmissionId: null, previewing: false, previewBase: null, previewArtistOnly: null,
    pairKey: null, colourResults: new Map(), displayedResult: null,
    desiredMonochrome: PROJECT_SETTINGS.monochrome, colourWorking: false };
  setColourChoice(PROJECT_SETTINGS.monochrome);
  ui.allowReuse.checked = false;
  ui.declineReuse.checked = false;
  ui.artistOnly.checked = false;
  ui.sharedLibrary.checked = true;
  const { loadPhoto, releasePhoto, develop } = createExposureProcessor();
  const contributions = createExposureContributionHistory();
  const storage = new GoogleDriveStorage(EXPOSURE_CONFIG);
  let retryTimer = null;
  let retryTarget = null;
  let retryAttempts = 0;
  let lastSaveError = null;
  let connectionRetryAttempts = 0;
  let lastConnectionError = null;
  let exited = false;
  const workflow = new ExposureArchiveWorkflow({
    storage, settings: PROJECT_SETTINGS, render: renderSubmission,
    onProgress: ({ stage }) => {
      if (stage !== "preview" && stage !== "archive") return;
      presentResult(workflow.operation);
      state.previewing = true;
      ui.busy.textContent = "Developing…";
      refreshActions();
    }
  });
  function setColourChoice(monochrome) {
    ui.monochrome.checked = monochrome;
    ui.colour.checked = !monochrome;
  }
  function announce(message) { ui.status.textContent = message; }
  function restoreConnectionStatus() {
    const reconnecting = retryTarget === "connection";
    announce(state.connecting && state.selectedFile ? "" : state.connecting || reconnecting ? "Please wait…"
        : state.ready || !storage.configured ? "" : "Photo submissions are temporarily unavailable.");
    ui.retry.hidden = state.connecting || reconnecting || state.ready || !storage.configured;
  }
  function clearError() { ui.error.hidden = true; ui.error.textContent = ""; ui.retry.hidden = true; }
  function showError(error) {
    ui.error.textContent = error instanceof Error ? error.message : "The save could not be confirmed.";
    ui.error.hidden = false;
    ui.retry.hidden = false;
    ui.retry.textContent = workflow.pending || pendingColourResults() ? "Retry saving" : "Retry";
  }
  function pendingColourResults() {
    return Array.from(state.colourResults.values()).some(record => !record.operation?.receipt);
  }
  function isRetryableSaveError(error) {
    if (error.previousResultRestored) return false;
    if (error.code) return ["REQUEST_TIMEOUT", "CONNECTION_TIMEOUT", "CONNECTION_FAILED", "NOT_CONNECTED",
      "SEND_FAILED", "BRIDGE_UNAVAILABLE", "ARCHIVE_UNAVAILABLE", "ARCHIVE_ERROR", "RPC_FAILED", "RPC_FAILURE", "SERVER_ERROR", "BUSY",
      "RATE_LIMITED", "COLLECTION_REFRESHING", "FILE_READ_TIMEOUT", "INVALID_RESPONSE"].includes(error.code);
    return /network|connection|timed? ?out|response lost|could not finish this request/i.test(error.message || "") ||
      error.message === "The archive did not confirm the exposure. Please retry saving.";
  }
  function clearRetryTimer() {
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
    retryTarget = null;
  }
  function scheduleRetry(error, connection = false) {
    if (exited || !isRetryableSaveError(error) || (connection ? workflow.pending : !workflow.pending)) return;
    clearRetryTimer();
    const delays = [2000, 5000, 15000, 30000];
    const attempt = connection ? connectionRetryAttempts++ : retryAttempts++;
    const delay = delays[Math.min(attempt, delays.length - 1)];
    retryTarget = connection ? "connection" : "save";
    retryTimer = setTimeout(() => {
      retryTimer = null;
      retryTarget = null;
      if (exited) return;
      if (state.working || state.colourWorking || state.connecting) {
        if (connection && !workflow.pending) scheduleRetry(error, true);
        return;
      }
      if (workflow.pending) void retrySave();
      else if (connection) void connectArchive();
    }, delay);
    retryTimer?.unref?.();
  }
  async function retrySave() {
    if (exited || state.working || state.colourWorking || !workflow.pending) return;
    clearRetryTimer();
    const previousError = lastSaveError;
    await finishSubmission(async () => {
      if (["REQUEST_TIMEOUT", "CONNECTION_TIMEOUT", "CONNECTION_FAILED", "NOT_CONNECTED", "SEND_FAILED", "BRIDGE_UNAVAILABLE"].includes(previousError?.code)) {
        await storage.connect();
      }
      return workflow.retry();
    }, { background: true });
  }
  function pairKey(base, settings) {
    return JSON.stringify([base.sha256 || base.id, settings.baseExposure, settings.participantExposure, settings.contrast]);
  }
  function visiblePairIsCurrent() {
    const operation = workflow.operation;
    const base = operation?.begin?.base || operation?.previewBase || operation?.resultBase;
    return Boolean(base && operation.result && state.pairKey === pairKey(base, operation.settings));
  }
  function clearColourResults() {
    for (const record of state.colourResults.values()) {
      const canvas = record.result.preparedCanvas;
      if (canvas) canvas.width = canvas.height = 1;
    }
    state.colourResults.clear();
    state.pairKey = null;
    state.displayedResult = null;
  }
  function refreshActions() {
    const selected = Boolean(state.selectedFile);
    const pending = workflow.pending;
    const unsaved = pending || pendingColourResults();
    const completed = state.hasResult && !unsaved;
    const processing = state.working || state.colourWorking || (state.queued && (state.connecting || retryTarget === "connection"));
    const imageReady = state.hasResult && !state.colourWorking && (!state.working || state.previewing);
    for (const input of [ui.participantInput, ui.cameraInput]) {
      input.disabled = state.working || selected || pending || !sharingChoiceMade();
    }
    ui.sourceActions.hidden = selected || state.hasResult;
    ui.uploadActions.hidden = ui.sourceActions.hidden;
    ui.uploadInstructions.hidden = selected;
    ui.exposureControls.hidden = false;
    ui.exposureControls.classList.toggle("has-selection", selected);
    ui.nextPhotoNote.hidden = state.nextPhotoConsent === undefined;
    ui.outputOptions.hidden = false;
    ui.monochrome.disabled = state.working || state.colourWorking || unsaved || (selected && (!imageReady || !visiblePairIsCurrent()));
    ui.colour.disabled = ui.monochrome.disabled;
    ui.repeatActions.hidden = !state.hasResult && !(selected && !processing && !pending);
    ui.resultActions.hidden = !state.hasResult;
    ui.allowReuse.disabled = processing || unsaved || (selected && state.nextPhotoConsent === undefined);
    ui.declineReuse.disabled = ui.allowReuse.disabled;
    ui.artistOnly.disabled = processing || unsaved || (selected && !completed);
    ui.sharedLibrary.disabled = ui.artistOnly.disabled;
    ui.download.hidden = !state.hasResult;
    ui.rotate.hidden = !state.hasResult;
    ui.download.disabled = !imageReady || state.working || unsaved;
    ui.rotate.disabled = !state.hasResult || state.working || state.colourWorking || unsaved;
    const changedPool = ui.artistOnly.checked !== (workflow.operation?.artistOnly ?? false);
    ui.newPairing.hidden = !state.hasResult || state.rePairUnavailable || (!unsaved && !changedPool && workflow.operation?.receipt?.canRePair !== true);
    ui.newPairing.disabled = !completed || processing;
    ui.reset.disabled = processing || unsaved;
    ui.retry.disabled = state.working || state.connecting;
    ui.busy.hidden = !processing;
    ui.canvas.hidden = !state.hasResult || (processing && !state.previewing);
    ui.resultEmpty.hidden = state.hasResult || processing;
    ui.resultEmpty.textContent = selected ? "Your double exposure is not ready yet." : "Your double exposure will appear here.";
    ui.workspace.setAttribute("aria-busy", String(processing));
    ui.workspace.classList.toggle("has-result", state.hasResult);
    ui.busy.classList.toggle("is-finishing", state.previewing);
    ui.savingNote.hidden = !(workflow.pending || pendingColourResults() || state.colourWorking);
    ui.savingNote.textContent = savingMessage;
  }
  function setWorking(value, message) {
    state.working = value;
    if (value) { announce(""); ui.busy.textContent = message || developingMessage; }
    refreshActions();
  }
  function clearResult() {
    clearColourResults();
    state.hasResult = false;
    state.displayedSubmissionId = null;
    state.previewing = false;
    ui.canvas.hidden = true;
    ui.canvas.width = ui.canvas.height = 1;
    ui.resultEmpty.hidden = false;
    if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
    state.downloadUrl = null;
    state.downloadBlob = null;
    refreshActions();
  }

  function clearSelection({ keepNextPhotoChoices = false } = {}) {
    const consent = keepNextPhotoChoices ? state.nextPhotoConsent : undefined;
    releasePhoto(state.participant);
    state.participant = null;
    state.selectedFile = null;
    state.selectedHash = null;
    state.selectionChoices = null;
    state.nextPhotoConsent = undefined;
    state.queued = false;
    state.rePairUnavailable = false;
    if (retryTarget !== "connection") clearRetryTimer();
    lastSaveError = null;
    retryAttempts = 0;
    if (lastConnectionError && retryTimer === null && !state.connecting) scheduleRetry(lastConnectionError, true);
    ui.allowReuse.checked = consent === true;
    ui.declineReuse.checked = consent === false;
    clearResult();
    restoreConnectionStatus();
  }

  async function fileFromBase(base) {
    if (!/^image\/(jpeg|png|webp|avif)$/.test(base.mimeType)) throw new Error("The base photograph is not supported.");
    if (base.path !== undefined) return ExposureBaseAssets.loadFile(base, { timeoutMs: EXPOSURE_CONFIG.requestTimeoutMs });
    const binary = atob(base.base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new File([bytes], base.name || "base.jpg", { type: base.mimeType });
  }
  async function renderSubmission({ base, settings }) {
    const basePhoto = await loadPhoto(await fileFromBase(base));
    try {
      const preparedCanvas = document.createElement("canvas");
      return { ...await develop(basePhoto, state.participant, preparedCanvas, settings), preparedCanvas };
    } finally { releasePhoto(basePhoto); }
  }
  async function connectArchive() {
    if (exited || state.connecting || state.working || state.colourWorking || workflow.pending || pendingColourResults()) return;
    clearRetryTimer();
    clearError();
    if (!storage.configured) {
      state.ready = false;
      restoreConnectionStatus();
      refreshActions();
      return;
    }
    state.connecting = true;
    const artistOnly = state.selectionChoices?.artistOnly ?? ui.artistOnly.checked;
    restoreConnectionStatus();
    refreshActions();
    try {
      const collection = await storage.connect({ excludedBaseHashes: contributions.hashes(), artistOnly });
      if (exited) return;
      lastConnectionError = null;
      connectionRetryAttempts = 0;
      state.ready = collection.totalEligible > 0;
      state.previewArtistOnly = artistOnly;
      state.previewBase = artistOnly === (state.selectionChoices?.artistOnly ?? ui.artistOnly.checked) ? collection.previewBase || null : null;
    } catch (error) {
      if (exited) return;
      state.ready = false;
      lastConnectionError = error;
      scheduleRetry(error, true);
      console.warn("Photo collection unavailable:", error.code || error.name, error.message);
    } finally {
      state.connecting = false;
      if (!exited) {
        if (!state.working && !workflow.pending && !state.hasResult) restoreConnectionStatus();
        refreshActions();
      }
    }
    if (!exited && artistOnly !== (state.selectionChoices?.artistOnly ?? ui.artistOnly.checked)) {
      await connectArchive();
    }
    if (!exited) await startSelectedPhoto();
  }
  function presentResult(operation) {
    const base = operation.begin?.base || operation.previewBase || operation.resultBase;
    const key = pairKey(base, operation.settings);
    if (state.pairKey !== key) {
      clearColourResults();
      state.pairKey = key;
      state.desiredMonochrome = operation.settings.monochrome;
    }
    let record = state.colourResults.get(operation.settings.monochrome);
    if (!record || record.result.blob !== operation.result.blob) {
      record = { base, settings: operation.settings, result: operation.result, operation };
      state.colourResults.set(operation.settings.monochrome, record);
    } else record.operation = operation;
    if (state.desiredMonochrome === record.settings.monochrome && !state.colourWorking) showColourResult(record);
  }
  function showColourResult(record) {
    if (state.displayedResult === record) {
      state.displayedSubmissionId = record.operation?.submissionId || state.displayedSubmissionId;
      return;
    }
    const preparedCanvas = record.result.preparedCanvas;
    if (!preparedCanvas) throw new Error("The developed image is unavailable. Please retry.");
    ui.canvas.width = record.result.width;
    ui.canvas.height = record.result.height;
    const visibleContext = ui.canvas.getContext("2d");
    if (!visibleContext) throw new Error("This browser cannot display the double exposure.");
    visibleContext.drawImage(preparedCanvas, 0, 0);
    if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
    state.downloadUrl = URL.createObjectURL(record.result.blob);
    state.downloadBlob = record.result.blob;
    state.hasResult = true;
    state.displayedResult = record;
    state.displayedSubmissionId = record.operation?.submissionId || `${workflow.operation.submissionId}-${record.settings.monochrome ? "bw" : "colour"}`;
    setColourChoice(record.settings.monochrome);
    ui.canvas.hidden = false;
    ui.resultEmpty.hidden = true;
  }
  async function finishSubmission(action, { background = false } = {}) {
    if (exited || state.working) return;
    clearRetryTimer();
    clearError();
    state.previewing = state.hasResult && (background || workflow.pending);
    let confirmed = false;
    setWorking(true, state.previewing ? "Developing…" : developingMessage);
    try {
      const operation = await action();
      if (exited) return;
      lastSaveError = null;
      retryAttempts = 0;
      lastConnectionError = null;
      connectionRetryAttempts = 0;
      state.ready = true;
      state.rePairUnavailable = false;
      presentResult(operation);
      if (state.nextPhotoConsent === undefined) {
        state.nextPhotoConsent = null;
        ui.allowReuse.checked = false;
        ui.declineReuse.checked = false;
      }
      confirmed = true;
      announce("");
    } catch (error) {
      if (exited) return;
      lastSaveError = error;
      scheduleRetry(error);
      if (retryTimer !== null) clearError();
      else showError(error);
      if (error.previousResultRestored) {
        ui.retry.hidden = true;
        state.rePairUnavailable = error.code === "NO_ALTERNATIVE_BASE";
      }
      announce(error.previousResultRestored ? "Your previous exposure is still saved."
        : retryTimer !== null ? ""
          : error.originalSaved ? "Your photo is saved. Please retry to finish the double exposure."
            : "The save could not be confirmed.");
    } finally {
      if (!exited) {
        if (state.displayedResult) setColourChoice(state.desiredMonochrome);
        state.previewing = state.hasResult && (workflow.pending || pendingColourResults() || state.colourWorking);
        setWorking(false);
      }
    }
    if (confirmed && !exited) await continueSaving();
  }
  async function continueSaving() {
    if (exited || state.working || state.colourWorking || workflow.pending) return;
    const variant = Array.from(state.colourResults.values()).find(record => !record.operation);
    if (variant) {
      const { blob, width, height } = variant.result;
      await finishSubmission(() => workflow.changeMonochrome(variant.settings.monochrome,
        { result: { blob, width, height }, base: variant.base }), { background: true });
      return;
    }
  }

  async function changeDisplayedColour(monochrome) {
    const current = state.displayedResult;
    state.desiredMonochrome = monochrome;
    setColourChoice(monochrome);
    if (state.colourResults.has(monochrome)) {
      showColourResult(state.colourResults.get(monochrome));
      refreshActions();
      return;
    }
    state.colourWorking = true;
    state.previewing = state.hasResult;
    refreshActions();
    try {
      const settings = Object.freeze({ ...current.settings, monochrome });
      const result = await renderSubmission({ base: current.base, settings });
      const record = { base: current.base, settings, result, operation: null };
      state.colourResults.set(monochrome, record);
      showColourResult(record);
    } catch (error) {
      state.desiredMonochrome = current.settings.monochrome;
      setColourChoice(state.desiredMonochrome);
      ui.error.textContent = error instanceof Error ? error.message : "The colour version could not be developed.";
      ui.error.hidden = false;
    } finally {
      state.colourWorking = false;
      state.previewing = state.hasResult && (workflow.pending || pendingColourResults());
      refreshActions();
    }
    await continueSaving();
  }

  async function startSelectedPhoto() {
    if (!state.queued || !state.participant || state.working || workflow.pending || !storage.configured) return;
    if (!state.ready && (typeof ExposureBaseAssets === "undefined" || typeof ExposureBaseAssets.chooseBase !== "function")) return;
    state.queued = false;
    clearError();
    const candidate = state.ready && state.previewArtistOnly === state.selectionChoices.artistOnly ? state.previewBase : null;
    const excludedBaseHashes = contributions.hashes();
    const excluded = new Set(excludedBaseHashes);
    const artistOnly = state.selectionChoices.artistOnly;
    state.previewBase = null;
    await finishSubmission(async () => {
      let previewBase = candidate;
      if (previewBase || (storage.configured && typeof ExposureBaseAssets !== "undefined")) {
        const hash = state.selectedHash;
        // A photo cannot be paired with an identical copy of itself.
        if (previewBase && (hash === previewBase.sha256 || excluded.has(previewBase.sha256) || (artistOnly && !previewBase.path))) previewBase = null;
        if (!previewBase && (!candidate || artistOnly) && typeof ExposureBaseAssets !== "undefined") {
          try { previewBase = await ExposureBaseAssets.chooseBase(hash, excludedBaseHashes); }
          catch (error) { if (error.code !== "NO_LOCAL_BASE") throw error; }
        }
      }
      return workflow.start(state.selectedFile, Object.freeze({ ...state.selectionChoices, excludedBaseHashes, ...(previewBase ? { previewBase } : {}) }));
    });
    if (!workflow.pending) connectArchive();
  }

  function sharingChoiceMade() {
    return ui.allowReuse.checked !== ui.declineReuse.checked;
  }

  async function chooseParticipantPhoto(input) {
    const file = input.files?.[0];
    if (!file || state.selectedFile || state.working || workflow.pending) return;
    if (!sharingChoiceMade()) {
      input.value = "";
      announce("Choose Yes or No before selecting a photo.");
      refreshActions();
      return;
    }
    clearError();
    state.selectedFile = file;
    state.selectionChoices = Object.freeze({ allowReuse: ui.allowReuse.checked, monochrome: ui.monochrome.checked, artistOnly: ui.artistOnly.checked });
    state.queued = true;
    clearResult();
    setWorking(true);
    try {
      const uploadFile = await prepareParticipantFile(file);
      state.selectedFile = uploadFile;
      state.participant = await loadPhoto(uploadFile);
      const digest = await crypto.subtle.digest("SHA-256", await uploadFile.arrayBuffer());
      state.selectedHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      contributions.remember(state.selectedHash);
    }
    catch (error) {
      clearSelection();
      showError(error);
      ui.retry.hidden = true;
      return;
    } finally { input.value = ""; setWorking(false); }
    restoreConnectionStatus();
    refreshActions();
    await startSelectedPhoto();
  }
  for (const input of [ui.participantInput, ui.cameraInput]) {
    input.addEventListener("change", () => chooseParticipantPhoto(input));
  }
  for (const input of [ui.allowReuse, ui.declineReuse]) {
    input.addEventListener("change", () => {
      if (input.disabled) {
        if (state.nextPhotoConsent !== undefined) {
          ui.allowReuse.checked = state.nextPhotoConsent === true;
          ui.declineReuse.checked = state.nextPhotoConsent === false;
        } else if (state.selectionChoices) {
          ui.allowReuse.checked = state.selectionChoices.allowReuse;
          ui.declineReuse.checked = !state.selectionChoices.allowReuse;
        }
        return;
      }
      if (state.nextPhotoConsent !== undefined) state.nextPhotoConsent = ui.allowReuse.checked;
      restoreConnectionStatus();
      refreshActions();
    });
  }
  for (const input of [ui.artistOnly, ui.sharedLibrary]) {
    input.addEventListener("change", () => {
      if (input.disabled) {
        ui.artistOnly.checked = state.poolChoice;
        ui.sharedLibrary.checked = !state.poolChoice;
        return;
      }
      if (!input.checked) return;
      state.poolChoice = ui.artistOnly.checked;
      state.previewBase = null;
      state.previewArtistOnly = null;
      state.rePairUnavailable = false;
      refreshActions();
      if (!state.selectedFile) void connectArchive();
    });
  }
  for (const [input, monochrome] of [[ui.monochrome, true], [ui.colour, false]]) {
    input.addEventListener("change", async () => {
      if (!input.checked) return;
      if (input.disabled) {
        setColourChoice(state.displayedResult ? state.desiredMonochrome : state.selectionChoices?.monochrome ?? PROJECT_SETTINGS.monochrome);
        return;
      }
      setColourChoice(monochrome);
      if (!state.hasResult) return;
      await changeDisplayedColour(monochrome);
    });
  }
  ui.newPairing.addEventListener("click", async () => {
    if (ui.newPairing.disabled || !state.hasResult || state.working || state.colourWorking || workflow.pending ||
        pendingColourResults() || (ui.artistOnly.checked === (workflow.operation?.artistOnly ?? false) && workflow.operation?.receipt?.canRePair !== true)) return;
    clearError();
    await finishSubmission(() => workflow.rePair({ monochrome: state.desiredMonochrome, excludedBaseHashes: contributions.hashes(), artistOnly: ui.artistOnly.checked }));
  });
  ui.reset.addEventListener("click", () => {
    if (ui.reset.disabled || state.working || state.colourWorking || workflow.pending || pendingColourResults()) return;
    clearError();
    clearSelection({ keepNextPhotoChoices: true });
  });
  ui.retry.addEventListener("click", async () => {
    if (state.working || state.connecting) return;
    clearError();
    if (workflow.pending) await retrySave();
    else if (pendingColourResults()) await continueSaving();
    else await connectArchive();
  });
  ui.rotate.addEventListener("click", async () => {
    if (!state.hasResult || state.working || state.colourWorking || workflow.pending || pendingColourResults()) return;
    clearError();
    setWorking(true, "Rotating…");
    try {
      const rotated = await rotateExposureCanvas(ui.canvas);
      const downloadUrl = URL.createObjectURL(rotated.blob);
      if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
      state.downloadUrl = downloadUrl;
      state.downloadBlob = rotated.blob;
      announce("Image rotated. Downloads use this orientation.");
    } catch (error) {
      ui.error.textContent = error instanceof Error ? error.message : "The image could not be rotated.";
      ui.error.hidden = false;
      announce("Your previous image is still available. Try rotating again.");
    } finally { setWorking(false); }
  });
  ui.download.addEventListener("click", () => {
    if (ui.download.disabled || !state.downloadUrl) return;
    return saveExposureImage(state.downloadBlob, state.downloadUrl, `double-exposure-${state.displayedSubmissionId}.jpg`);
  });
  window.addEventListener("beforeunload", (event) => {
    if (workflow.pending || state.colourWorking || pendingColourResults()) { event.preventDefault(); event.returnValue = ""; }
  });
  window.addEventListener("pagehide", (event) => {
    if (event.persisted) return;
    exited = true;
    clearRetryTimer();
    storage.dispose();
    releasePhoto(state.participant);
    clearColourResults();
    if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
  });
  window.addEventListener("online", () => {
    if (lastSaveError && isRetryableSaveError(lastSaveError) && workflow.pending) void retrySave();
    else if (lastConnectionError && isRetryableSaveError(lastConnectionError)) void connectArchive();
  });
  connectArchive();
}

if (typeof document !== "undefined" && document.getElementById("participant-input")) initializeExposureStudio();
