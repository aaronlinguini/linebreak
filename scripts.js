"use strict";

// Bounded light addition: decode sRGB, add each channel's light, and clip
// each channel independently. This does not model an exact film stock or
// recover a JPEG's original RAW data.
const ExposureMath = (() => {
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const srgbToLinear = (value) => value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
  const linearToSrgb = (value) => value <= 0.0031308
    ? value * 12.92
    : 1.055 * value ** (1 / 2.4) - 0.055;
  // A symmetric display-space contrast curve keeps both black and white fixed.
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

  function createMixer(settings) {
    const baseGain = 2 ** settings.baseExposure;
    const participantGain = 2 ** settings.participantExposure;
    const encode = Uint8ClampedArray.from({ length: 65536 }, (_, index) =>
      Math.round(clamp(contrastCurve(linearToSrgb(index / 65535), settings.contrast)) * 255));

    return function mix(base, participant, output, start = 0, end = base.length) {
      for (let index = start; index < end; index += 4) {
        let red = linearTable[base[index]] * baseGain + linearTable[participant[index]] * participantGain;
        let green = linearTable[base[index + 1]] * baseGain + linearTable[participant[index + 1]] * participantGain;
        let blue = linearTable[base[index + 2]] * baseGain + linearTable[participant[index + 2]] * participantGain;
        if (settings.monochrome) red = green = blue = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        // Preserve channels independently, including an already-white base.
        output[index] = encode[Math.round(clamp(red) * 65535)];
        output[index + 1] = encode[Math.round(clamp(green) * 65535)];
        output[index + 2] = encode[Math.round(clamp(blue) * 65535)];
        output[index + 3] = 255;
      }
    };
  }

  return Object.freeze({ clamp, srgbToLinear, linearToSrgb, contrastCurve, coverCrop, outputSize, selectIndex, createMixer });
})();

// Exposure treatment is the artist's decision. Pairing is selected by Google.
const PROJECT_SETTINGS = Object.freeze({
  baseExposure: 0, participantExposure: 0, contrast: 0, monochrome: false
});

// Shared by the archive page and the separate browser-only test page.
function createExposureProcessor() {
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
      const dimensions = ExposureMath.outputSize(image.naturalWidth, image.naturalHeight, SOURCE_EDGE);
      const source = document.createElement("canvas");
      source.width = dimensions.width;
      source.height = dimensions.height;
      const sourceContext = context(source);
      // Transparent PNG areas contribute no light, rather than becoming white.
      sourceContext.fillStyle = "#000";
      sourceContext.fillRect(0, 0, source.width, source.height);
      sourceContext.drawImage(image, 0, 0, source.width, source.height);
      const thumbnail = document.createElement("canvas");
      const thumbnailSize = ExposureMath.outputSize(source.width, source.height, 320);
      thumbnail.width = thumbnailSize.width;
      thumbnail.height = thumbnailSize.height;
      context(thumbnail).drawImage(source, 0, 0, thumbnail.width, thumbnail.height);
      // This resized working copy is for processing. The untouched original file
      // is uploaded separately by the archive workflow.
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
    // Do not upscale either photograph. Participant framing is a centered crop
    // to the base aspect ratio; every pixel must represent overlapping exposure.
    const baseSize = ExposureMath.outputSize(base.width, base.height, maxEdge);
    const crop = ExposureMath.coverCrop(participant.width, participant.height, baseSize.width, baseSize.height);
    const scale = Math.min(1, crop.width / baseSize.width, crop.height / baseSize.height);
    const width = Math.max(1, Math.round(baseSize.width * scale));
    const height = Math.max(1, Math.round(baseSize.height * scale));
    const scratch = document.createElement("canvas");
    scratch.width = width;
    scratch.height = height;
    const scratchContext = context(scratch);
    let source;
    try {
      source = await decodeSource(base);
      scratchContext.drawImage(source, 0, 0, width, height);
      source.close?.();
      source = null;
      const basePixels = scratchContext.getImageData(0, 0, width, height);
      scratchContext.clearRect(0, 0, width, height);
      source = await decodeSource(participant);
      const participantCrop = ExposureMath.coverCrop(participant.width, participant.height, width, height);
      scratchContext.drawImage(source, participantCrop.x, participantCrop.y, participantCrop.width, participantCrop.height, 0, 0, width, height);
      const participantPixels = scratchContext.getImageData(0, 0, width, height);
      return { width, height, base: basePixels.data, participant: participantPixels.data };
    } finally {
      source?.close?.();
      scratch.width = scratch.height = 1;
    }
  }
  async function processPixels(pair, settings) {
    const result = new ImageData(pair.width, pair.height);
    const mix = ExposureMath.createMixer(settings);
    // Yield between chunks so mobile browsers can paint and respond to controls.
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

function initializeExposureStudio() {
  const byId = (id) => document.getElementById(id);
  const ui = {
    workspace: byId("workspace"), canvas: byId("canvas"),
    resultEmpty: byId("result-empty"), participantPreview: byId("participant-preview"),
    participantInput: byId("participant-input"), uploadLabel: byId("upload-label"),
    download: byId("download-button"), retry: byId("retry-button"),
    status: byId("status"), error: byId("error"), busy: byId("busy-indicator")
  };
  const state = { working: false, ready: false, hasResult: false, participant: null, downloadUrl: null };
  const { loadPhoto, releasePhoto, develop } = createExposureProcessor();
  const storage = new GoogleDriveStorage(EXPOSURE_CONFIG);
  const workflow = new ExposureArchiveWorkflow({
    storage, settings: PROJECT_SETTINGS, render: renderSubmission,
    onProgress: ({ stage }) => {
      const labels = { original: "Saving photograph…", develop: "Developing…", archive: "Saving exposure…", saved: "Saved to the archive." };
      announce(labels[stage]);
      ui.busy.textContent = labels[stage];
    }
  });
  function announce(message) { ui.status.textContent = message; }
  function clearError() { ui.error.hidden = true; ui.error.textContent = ""; ui.retry.hidden = true; }
  function showError(error) {
    ui.error.textContent = error instanceof Error ? error.message : "The save could not be confirmed.";
    ui.error.hidden = false;
    ui.retry.hidden = false;
    ui.retry.textContent = workflow.pending ? "Retry saving" : "Retry";
  }
  function refreshActions() {
    ui.participantInput.disabled = state.working || !state.ready || workflow.pending;
    ui.download.hidden = !state.hasResult;
    ui.download.disabled = !state.hasResult || state.working;
    ui.retry.disabled = state.working;
    ui.busy.hidden = !state.working;
    ui.workspace.setAttribute("aria-busy", String(state.working));
    ui.workspace.classList.toggle("has-result", state.hasResult);
    ui.uploadLabel.textContent = state.hasResult ? "Add another photograph" : "Add a photograph";
  }
  function setWorking(value, message) {
    state.working = value;
    if (message) { announce(message); ui.busy.textContent = message; }
    refreshActions();
  }
  function clearResult() {
    state.hasResult = false;
    ui.canvas.hidden = true;
    ui.canvas.width = ui.canvas.height = 1;
    ui.participantPreview.hidden = true;
    ui.resultEmpty.hidden = false;
    if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
    state.downloadUrl = null;
    refreshActions();
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
      return await develop(basePhoto, state.participant, ui.canvas, settings);
    } finally { releasePhoto(basePhoto); }
  }
  async function connectArchive() {
    clearError();
    if (!storage.configured) {
      state.ready = false;
      announce("The collection is not connected yet.");
      refreshActions();
      return;
    }
    setWorking(true, "Connecting…");
    try {
      const collection = await storage.connect();
      state.ready = collection.totalEligible > 0;
      announce(state.ready ? "Add a photograph." : "The collection is waiting for its first photographs.");
      if (!state.ready) ui.retry.hidden = false;
    } catch (error) {
      state.ready = false;
      showError(error);
      announce("The collection could not be reached.");
    } finally { setWorking(false); }
  }
  async function finishSubmission(action) {
    setWorking(true);
    try {
      const operation = await action();
      state.downloadUrl = URL.createObjectURL(operation.result.blob);
      state.hasResult = true;
      ui.canvas.hidden = false;
      ui.participantPreview.hidden = true;
      ui.resultEmpty.hidden = true;
      announce("Saved to the archive.");
    } catch (error) {
      showError(error);
      announce(error.originalSaved ? "Your original is saved. The exposure still needs to be completed." : "The save could not be confirmed.");
    } finally { setWorking(false); }
  }

  ui.participantInput.addEventListener("change", async () => {
    const file = ui.participantInput.files?.[0];
    if (!file || state.working || workflow.pending || !state.ready) return;
    clearError();
    setWorking(true, "Preparing photograph…");
    let photo;
    try { photo = await loadPhoto(file); }
    catch (error) { showError(error); ui.retry.hidden = true; }
    finally { ui.participantInput.value = ""; setWorking(false); }
    if (!photo) return;
    releasePhoto(state.participant);
    state.participant = photo;
    clearResult();
    await finishSubmission(() => workflow.start(file));
  });
  ui.retry.addEventListener("click", async () => {
    if (state.working) return;
    clearError();
    if (workflow.pending) await finishSubmission(() => workflow.retry());
    else await connectArchive();
  });
  ui.download.addEventListener("click", () => {
    if (!state.hasResult || state.working || !state.downloadUrl) return;
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
    if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
  });
  connectArchive();
}

if (typeof document !== "undefined" && document.getElementById("participant-input")) initializeExposureStudio();
