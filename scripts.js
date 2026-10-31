"use strict";

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
  const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));
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

function initializeExposureStudio() {
  const byId = (id) => document.getElementById(id);
  const ui = {
    workspace: byId("workspace"), canvas: byId("canvas"),
    resultEmpty: byId("result-empty"), sourceActions: byId("source-actions"),
    exposureControls: byId("exposure-controls"), uploadInstructions: byId("upload-instructions"),
    outputOptions: byId("output-options"), monochrome: byId("visitor-monochrome"),
    resultActions: byId("result-actions"), allowReuse: byId("allow-reuse"),
    newPairing: byId("new-pairing-button"), reset: byId("reset-button"),
    participantInput: byId("participant-input"), cameraInput: byId("participant-camera-input"),
    download: byId("download-button"), rotate: byId("rotate-button"), retry: byId("retry-button"),
    status: byId("status"), error: byId("error"), busy: byId("busy-indicator")
  };
  const developingMessage = ui.busy.textContent;
  const state = { working: false, connecting: false, ready: false, hasResult: false, participant: null,
    selectedFile: null, selectionChoices: null, queued: false, downloadUrl: null, rePairUnavailable: false,
    displayedSubmissionId: null, previewing: false };
  ui.monochrome.checked = PROJECT_SETTINGS.monochrome;
  ui.allowReuse.checked = false;
  const { loadPhoto, releasePhoto, develop } = createExposureProcessor();
  const storage = new GoogleDriveStorage(EXPOSURE_CONFIG);
  const workflow = new ExposureArchiveWorkflow({
    storage, settings: PROJECT_SETTINGS, render: renderSubmission,
    onProgress: ({ stage }) => {
      if (stage !== "archive") return;
      presentResult(workflow.operation);
      state.previewing = true;
      ui.busy.textContent = "Finishing…";
      refreshActions();
    }
  });
  function announce(message) { ui.status.textContent = message; }
  function restoreConnectionStatus() {
    announce(state.connecting && state.selectedFile ? "" : state.connecting ? "Connecting…"
      : state.ready || !storage.configured ? "" : "Photo submissions are temporarily unavailable.");
    ui.retry.hidden = state.connecting || state.ready || !storage.configured;
  }
  function clearError() { ui.error.hidden = true; ui.error.textContent = ""; ui.retry.hidden = true; }
  function showError(error) {
    ui.error.textContent = error instanceof Error ? error.message : "The save could not be confirmed.";
    ui.error.hidden = false;
    ui.retry.hidden = false;
    ui.retry.textContent = workflow.pending ? "Retry saving" : "Retry";
  }
  function refreshActions() {
    const selected = Boolean(state.selectedFile);
    const pending = workflow.pending;
    const completed = state.hasResult && !pending;
    const processing = state.working || (state.queued && state.connecting);
    for (const input of [ui.participantInput, ui.cameraInput]) {
      input.disabled = state.working || selected || pending;
    }
    ui.sourceActions.hidden = selected || state.hasResult;
    ui.uploadInstructions.hidden = selected;
    ui.exposureControls.hidden = selected || state.hasResult || pending;
    ui.outputOptions.hidden = false;
    ui.monochrome.disabled = state.working || pending || (selected && !state.hasResult);
    ui.resultActions.hidden = !state.hasResult && !(selected && !processing && !pending);
    ui.allowReuse.disabled = state.working || selected || pending;
    ui.download.hidden = !state.hasResult;
    ui.rotate.hidden = !state.hasResult;
    ui.download.disabled = !completed || state.working;
    ui.rotate.disabled = !state.hasResult || state.working || pending;
    ui.newPairing.hidden = !completed || state.rePairUnavailable || workflow.operation?.receipt?.canRePair !== true;
    ui.newPairing.disabled = state.working || pending;
    ui.reset.disabled = processing || pending;
    ui.retry.disabled = state.working || state.connecting;
    ui.busy.hidden = !processing;
    ui.canvas.hidden = !state.hasResult || (processing && !state.previewing);
    ui.resultEmpty.hidden = state.hasResult || processing;
    ui.resultEmpty.textContent = selected ? "Your double exposure is not ready yet." : "Your double exposure will appear here.";
    ui.workspace.setAttribute("aria-busy", String(processing));
    ui.workspace.classList.toggle("has-result", state.hasResult);
    ui.busy.classList.toggle("is-finishing", state.previewing);
  }
  function setWorking(value, message) {
    state.working = value;
    if (value) { announce(""); ui.busy.textContent = message || developingMessage; }
    refreshActions();
  }
  function clearResult() {
    state.hasResult = false;
    state.displayedSubmissionId = null;
    state.previewing = false;
    ui.canvas.hidden = true;
    ui.canvas.width = ui.canvas.height = 1;
    ui.resultEmpty.hidden = false;
    if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
    state.downloadUrl = null;
    refreshActions();
  }

  function clearSelection() {
    releasePhoto(state.participant);
    state.participant = null;
    state.selectedFile = null;
    state.selectionChoices = null;
    state.queued = false;
    state.rePairUnavailable = false;
    ui.allowReuse.checked = false;
    clearResult();
    restoreConnectionStatus();
  }

  function fileFromBase(base) {
    if (!/^image\/(jpeg|png|webp|avif)$/.test(base.mimeType)) throw new Error("The base photograph is not supported.");
    const binary = atob(base.base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new File([bytes], base.name || "base.jpg", { type: base.mimeType });
  }
  async function renderSubmission({ base, settings }) {
    const basePhoto = await loadPhoto(fileFromBase(base));
    try {
      const preparedCanvas = document.createElement("canvas");
      return { ...await develop(basePhoto, state.participant, preparedCanvas, settings), preparedCanvas };
    } finally { releasePhoto(basePhoto); }
  }
  async function connectArchive() {
    if (state.connecting) return;
    clearError();
    if (!storage.configured) {
      state.ready = false;
      restoreConnectionStatus();
      refreshActions();
      return;
    }
    state.connecting = true;
    restoreConnectionStatus();
    refreshActions();
    try {
      const collection = await storage.connect();
      state.ready = collection.totalEligible > 0;
    } catch (error) {
      state.ready = false;
      console.warn("Photo collection unavailable:", error.code || error.name, error.message);
    } finally {
      state.connecting = false;
      if (!state.working && !workflow.pending && !state.hasResult) restoreConnectionStatus();
      refreshActions();
    }
    await startSelectedPhoto();
  }
  function presentResult(operation) {
    if (state.displayedSubmissionId === operation.submissionId) return;
    const preparedCanvas = operation.result.preparedCanvas;
    if (!preparedCanvas) throw new Error("The developed image is unavailable. Please retry.");
    ui.canvas.width = operation.result.width;
    ui.canvas.height = operation.result.height;
    const visibleContext = ui.canvas.getContext("2d");
    if (!visibleContext) throw new Error("This browser cannot display the double exposure.");
    visibleContext.drawImage(preparedCanvas, 0, 0);
    preparedCanvas.width = preparedCanvas.height = 1;
    delete operation.result.preparedCanvas;
    if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
    state.downloadUrl = URL.createObjectURL(operation.result.blob);
    state.hasResult = true;
    state.displayedSubmissionId = operation.submissionId;
    ui.monochrome.checked = operation.settings.monochrome;
    ui.canvas.hidden = false;
    ui.resultEmpty.hidden = true;
  }
  async function finishSubmission(action) {
    state.previewing = false;
    setWorking(true);
    try {
      const operation = await action();
      state.rePairUnavailable = false;
      presentResult(operation);
      announce("");
    } catch (error) {
      showError(error);
      if (error.previousResultRestored) {
        ui.retry.hidden = true;
        state.rePairUnavailable = error.code === "NO_ALTERNATIVE_BASE";
      }
      announce(error.previousResultRestored ? "Your previous exposure is still saved."
        : error.originalSaved ? "Your photo is saved. Please retry to finish the double exposure."
          : "The save could not be confirmed.");
    } finally {
      if (workflow.operation?.settings) ui.monochrome.checked = workflow.operation.settings.monochrome;
      state.previewing = workflow.pending && state.displayedSubmissionId === workflow.operation?.submissionId;
      setWorking(false);
    }
  }

  async function startSelectedPhoto() {
    if (!state.queued || !state.participant || state.working || workflow.pending || !state.ready) return;
    state.queued = false;
    clearError();
    await finishSubmission(() => workflow.start(state.selectedFile, state.selectionChoices));
  }

  async function chooseParticipantPhoto(input) {
    const file = input.files?.[0];
    if (!file || state.selectedFile || state.working || workflow.pending) return;
    clearError();
    state.selectedFile = file;
    state.selectionChoices = Object.freeze({ allowReuse: ui.allowReuse.checked, monochrome: ui.monochrome.checked });
    state.queued = true;
    clearResult();
    setWorking(true);
    try { state.participant = await loadPhoto(file); }
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
  ui.monochrome.addEventListener("change", async () => {
    if (state.working || workflow.pending || state.queued) {
      ui.monochrome.checked = workflow.operation?.settings.monochrome ?? state.selectionChoices?.monochrome ?? ui.monochrome.checked;
      return;
    }
    if (!state.hasResult || workflow.operation.settings.monochrome === ui.monochrome.checked) return;
    clearError();
    await finishSubmission(() => workflow.changeMonochrome(ui.monochrome.checked));
  });
  ui.newPairing.addEventListener("click", async () => {
    if (!state.hasResult || state.working || workflow.pending || workflow.operation?.receipt?.canRePair !== true) return;
    clearError();
    await finishSubmission(() => workflow.rePair());
  });
  ui.reset.addEventListener("click", () => {
    if (state.working || workflow.pending) return;
    clearError();
    clearSelection();
  });
  ui.retry.addEventListener("click", async () => {
    if (state.working || state.connecting) return;
    clearError();
    if (workflow.pending) await finishSubmission(() => workflow.retry());
    else await connectArchive();
  });
  ui.rotate.addEventListener("click", async () => {
    if (!state.hasResult || state.working || workflow.pending) return;
    clearError();
    setWorking(true, "Rotating…");
    try {
      const rotated = await rotateExposureCanvas(ui.canvas);
      const downloadUrl = URL.createObjectURL(rotated.blob);
      if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
      state.downloadUrl = downloadUrl;
      announce("Image rotated. Downloads use this orientation.");
    } catch (error) {
      ui.error.textContent = error instanceof Error ? error.message : "The image could not be rotated.";
      ui.error.hidden = false;
      announce("Your previous image is still available. Try rotating again.");
    } finally { setWorking(false); }
  });
  ui.download.addEventListener("click", () => {
    if (!state.hasResult || state.working || workflow.pending || !state.downloadUrl) return;
    const link = document.createElement("a");
    link.href = state.downloadUrl;
    link.download = `double-exposure-${workflow.operation.submissionId}.jpg`;
    document.body.append(link);
    link.click();
    link.remove();
  });
  window.addEventListener("beforeunload", (event) => {
    if (workflow.pending) { event.preventDefault(); event.returnValue = ""; }
  });
  window.addEventListener("pagehide", (event) => {
    if (event.persisted) return;
    storage.dispose();
    releasePhoto(state.participant);
    if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
  });
  connectArchive();
}

if (typeof document !== "undefined" && document.getElementById("participant-input")) initializeExposureStudio();
