"use strict";

// Artist-only comparison page: the main site keeps its existing renderer.
function initializeLocalExposureTest() {
  const byId = (id) => document.getElementById(id);
  const ui = {
    workspace: byId("test-workspace"), canvas: byId("test-canvas"),
    referenceCanvas: byId("test-reference-canvas"), referenceEmpty: byId("test-reference-empty"),
    empty: byId("test-empty"), busy: byId("test-busy"),
    base: byId("test-base"), participant: byId("test-participant"),
    baseCamera: byId("test-base-camera"), participantCamera: byId("test-participant-camera"),
    download: byId("test-download"), referenceDownload: byId("test-reference-download"),
    rotate: byId("test-rotate"),
    settingsDownload: byId("test-settings-download"),
    renderer: byId("test-renderer"), baseExposure: byId("test-base-exposure"),
    participantExposure: byId("test-participant-exposure"), monochrome: byId("test-monochrome"),
    contrast: byId("test-contrast"), contrastValue: byId("test-contrast-value"), contrastControl: byId("test-contrast-control"),
    balance: byId("test-balance"), balanceValue: byId("test-balance-value"), balanceControl: byId("test-balance-control"),
    baseValue: byId("test-base-value"), participantValue: byId("test-participant-value"),
    reset: byId("test-reset"), trialTitle: byId("trial-title"),
    tonesReset: byId("test-tones-reset"),
    status: byId("test-status"), error: byId("test-error")
  };
  const toneControls = ["shadows", "highlights", "mids", "whites", "blacks"].map((name) => ({
    name, input: byId(`test-${name}`), output: byId(`test-${name}-value`)
  }));
  const toneInputs = toneControls.map(({ input }) => input);
  const processor = createExposureProcessor({
    mixerFactory(settings) {
      const factories = {
        balanced: ExposureMath.createBalancedMixer,
        revised: FilmExposureMath.createRevisedMixer,
        smooth: FilmExposureMath.createSmoothMixer,
        film: FilmExposureMath.createMixer,
        linear: ExposureMath.createMixer
      };
      return (factories[settings.renderer] || ExposureMath.createMixer)(settings);
    }
  });
  const state = {
    base: null, participant: null, working: false, disposed: false,
    resultUrl: null, referenceUrl: null, settingsUrl: null, resultBlob: null, referenceBlob: null,
    referenceRecord: null, completed: null, rotationQuarterTurns: 0,
    neutralPixels: null, neutralBlob: null, neutralSettings: null,
    exportPending: false, exportRevision: 0, exportTimer: null
  };
  const outputListeners = new Set();
  const controls = [ui.base, ui.participant, ui.baseCamera, ui.participantCamera, ui.renderer, ui.baseExposure, ui.participantExposure, ui.contrast, ui.balance, ui.monochrome, ui.reset, ui.tonesReset, ui.rotate, ...toneInputs];
  ui.monochrome.checked = PROJECT_SETTINGS.monochrome;

  function evLabel(value) {
    const number = Number(value);
    return `${number < 0 ? "−" : number > 0 ? "+" : ""}${Math.abs(number)} EV`;
  }
  function updateReadouts() {
    ui.baseValue.textContent = evLabel(ui.baseExposure.value);
    ui.participantValue.textContent = evLabel(ui.participantExposure.value);
    ui.contrastValue.textContent = ui.contrast.value;
    ui.balanceValue.textContent = `${ui.balance.value}%`;
    for (const { input, output } of toneControls) output.textContent = Number(input.value) > 0 ? `+${input.value}` : input.value;
  }
  const readTones = () => Object.fromEntries(toneControls.map(({ name, input }) => [name, Number(input.value)]));
  function updateTreatmentControls() {
    ui.contrastControl.hidden = !["linear", "balanced"].includes(ui.renderer.value);
    ui.contrast.disabled = state.working || ui.contrastControl.hidden;
    ui.balanceControl.hidden = ui.renderer.value !== "balanced";
    ui.balance.disabled = state.working || ui.balanceControl.hidden;
    for (const input of toneInputs) input.disabled = state.working || !state.neutralPixels;
    ui.tonesReset.disabled = state.working || !state.neutralPixels;
  }
  function updateTrialTitle(settings = { renderer: ui.renderer.value, baseExposure: Number(ui.baseExposure.value), participantExposure: Number(ui.participantExposure.value), contrast: Number(ui.contrast.value), balanceStrength: Number(ui.balance.value), tones: readTones() }, rotationDegrees = state.rotationQuarterTurns * 90) {
    const names = { balanced: "reduced overlap", revised: "revised smooth", smooth: "saved smooth exposure", film: "earlier film curve", linear: "current addition" };
    const contrast = ["linear", "balanced"].includes(settings.renderer) ? ` · contrast ${settings.contrast}` : "";
    const balance = settings.renderer === "balanced" ? ` · ${settings.balanceStrength}%` : "";
    const tones = settings.tones && Object.values(settings.tones).some((value) => value !== 0) ? " · tones adjusted" : "";
    const rotation = rotationDegrees ? ` · rotated ${rotationDegrees}°` : "";
    ui.trialTitle.textContent = `Trial · ${names[settings.renderer]}${balance}${contrast} · ${evLabel(settings.baseExposure)} / ${evLabel(settings.participantExposure)}${tones}${rotation}`;
  }
  function settingsFor(renderer, baseExposure, participantExposure, contrast = 0, balanceStrength = 0) {
    return {
      ...PROJECT_SETTINGS, renderer, baseExposure, participantExposure,
      contrast, balanceStrength, filmContrast: 1, monochrome: ui.monochrome.checked
    };
  }
  function releaseUrl(key) {
    if (state[key]) URL.revokeObjectURL(state[key]);
    state[key] = null;
  }
  function updateDownloads() {
    for (const [button, url] of [[ui.download, state.resultUrl], [ui.referenceDownload, state.referenceUrl], [ui.settingsDownload, state.settingsUrl]]) {
      button.hidden = !url;
      button.disabled = state.working || !url || (button !== ui.referenceDownload && state.exportPending);
    }
    ui.rotate.hidden = !state.resultUrl;
    ui.rotate.disabled = state.working || state.exportPending || !state.resultUrl;
    for (const listener of outputListeners) listener();
  }
  function invalidateToneExport() {
    if (state.exportTimer !== null) clearTimeout(state.exportTimer);
    state.exportTimer = null;
    state.exportRevision++;
    state.exportPending = false;
  }
  function clearResults(includeReference = true) {
    invalidateToneExport();
    state.neutralPixels = state.neutralBlob = state.neutralSettings = null;
    releaseUrl("resultUrl");
    releaseUrl("settingsUrl");
    state.completed = null;
    state.resultBlob = null;
    ui.canvas.hidden = true;
    ui.canvas.width = ui.canvas.height = 1;
    ui.empty.hidden = false;
    if (includeReference) {
      releaseUrl("referenceUrl");
      state.referenceRecord = null;
      state.referenceBlob = null;
      ui.referenceCanvas.hidden = true;
      ui.referenceCanvas.width = ui.referenceCanvas.height = 1;
      ui.referenceEmpty.hidden = false;
    }
    updateDownloads();
    updateTreatmentControls();
  }
  function setWorking(value) {
    state.working = value;
    for (const control of controls) control.disabled = value;
    updateTreatmentControls();
    ui.busy.hidden = !value;
    ui.workspace.setAttribute("aria-busy", String(value));
    updateDownloads();
  }
  function clearError() {
    ui.error.hidden = true;
    ui.error.textContent = "";
  }
  function reportError(error) {
    clearResults();
    ui.error.textContent = error instanceof Error ? error.message : "The photographs could not be processed.";
    ui.error.hidden = false;
    ui.status.textContent = "Choose a photograph or change the trial settings to try again.";
  }
  async function sourceRecord(file, photo) {
    let sha256 = null;
    if (typeof crypto !== "undefined" && crypto.subtle && typeof file.arrayBuffer === "function") {
      try {
        const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
        sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      } catch { /* Source hashes are optional when WebCrypto is unavailable. */ }
    }
    return {
      name: file.name, type: file.type, byteLength: file.size,
      lastModified: file.lastModified ?? null, sha256,
      originalWidth: photo.originalWidth, originalHeight: photo.originalHeight,
      workingWidth: photo.width, workingHeight: photo.height
    };
  }
  function renderRecord(settings, result, rotationQuarterTurns = null) {
    const models = {
      balanced: { rendererVersion: ExposureMath.balancedVersion, modelParameters: { ...ExposureMath.balancedParameters } },
      revised: { rendererVersion: FilmExposureMath.revisedVersion, modelParameters: { ...FilmExposureMath.revisedParameters } },
      smooth: { rendererVersion: FilmExposureMath.smoothVersion, modelParameters: { ...FilmExposureMath.smoothParameters } },
      film: { rendererVersion: FilmExposureMath.version, modelParameters: { ...FilmExposureMath.parameters } },
      linear: { rendererVersion: "linear-addition-c6a65ba" }
    };
    return {
      renderer: settings.renderer,
      ...models[settings.renderer],
      settings: { ...settings }, width: result.width, height: result.height,
      ...(rotationQuarterTurns === null ? {} : { rotationDegrees: rotationQuarterTurns * 90 }),
      ...(settings.tones ? { postProcessing: { version: ToneAdjustments.version, tones: { ...settings.tones } } } : {}),
      format: "image/jpeg", quality: 0.95
    };
  }
  function recipeFor(settings, pixels, rotationQuarterTurns = state.rotationQuarterTurns) {
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      sources: { base: state.base.sourceRecord, participant: state.participant.sourceRecord },
      preparation: { portraitRotation: "90-degrees-clockwise", fit: "contain-with-black-padding", maxEdge: 2400 },
      reference: state.referenceRecord,
      trial: renderRecord(settings, pixels, rotationQuarterTurns)
    };
  }
  function tonePixels(tones, neutralPixels = state.neutralPixels) {
    const adjust = ToneAdjustments.createMapper(tones);
    if (!adjust) return { pixels: neutralPixels, neutral: true };
    const pixels = new ImageData(new Uint8ClampedArray(neutralPixels.data), neutralPixels.width, neutralPixels.height);
    adjust(pixels.data);
    return { pixels, neutral: false };
  }
  async function canvasBlob(canvas) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
    if (!blob) throw new Error("The image download could not be prepared. Please retry.");
    return blob;
  }
  function saveDownload(blob, recipe) {
    const nextResultUrl = URL.createObjectURL(blob);
    let nextSettingsUrl;
    try {
      nextSettingsUrl = URL.createObjectURL(new Blob([JSON.stringify(recipe, null, 2)], { type: "application/json" }));
    } catch (error) {
      URL.revokeObjectURL(nextResultUrl);
      throw error;
    }
    releaseUrl("resultUrl");
    releaseUrl("settingsUrl");
    state.resultUrl = nextResultUrl;
    state.resultBlob = blob;
    state.settingsUrl = nextSettingsUrl;
    state.completed = recipe;
    state.exportPending = false;
    updateDownloads();
  }
  async function exportTonePreview(revision, neutral, recipe) {
    if (state.disposed || revision !== state.exportRevision) return;
    try {
      const blob = neutral ? state.neutralBlob : await canvasBlob(ui.canvas);
      if (state.disposed || revision !== state.exportRevision) return;
      saveDownload(blob, recipe);
      ui.status.textContent = "Ready. Compare the images or adjust the trial.";
    } catch (error) {
      if (state.disposed || revision !== state.exportRevision) return;
      ui.error.textContent = error instanceof Error ? error.message : "The image download could not be prepared.";
      ui.error.hidden = false;
      // Keep the painted preview, but never offer an older download as current.
      state.exportPending = true;
      updateDownloads();
      ui.status.textContent = "Preview updated. Adjust a tone or reset tones to retry preparing its download.";
    }
  }
  function showTonePreview(tones, immediate = false) {
    if (state.exportTimer !== null) clearTimeout(state.exportTimer);
    state.exportTimer = null;
    const revision = ++state.exportRevision;
    const { pixels, neutral } = tonePixels(tones);
    ui.canvas.getContext("2d").putImageData(pixels, 0, 0);
    const settings = { ...state.neutralSettings, tones: { ...tones } };
    const recipe = recipeFor(settings, pixels);
    state.completed = recipe;
    state.exportPending = true;
    ui.canvas.hidden = false;
    ui.empty.hidden = true;
    updateTrialTitle(settings);
    updateDownloads();
    ui.status.textContent = "Preview updated. Preparing download…";
    if (immediate || neutral) return exportTonePreview(revision, neutral, recipe);
    state.exportTimer = setTimeout(() => {
      state.exportTimer = null;
      void exportTonePreview(revision, neutral, recipe);
    }, 120);
    return Promise.resolve();
  }
  function changeTones(immediate = false) {
    updateReadouts();
    if (state.working || state.disposed || !state.neutralPixels) return;
    clearError();
    return showTonePreview(readTones(), immediate);
  }
  async function renderResults(includeReference) {
    // Capture all controls before awaiting; the recipe belongs to these outputs.
    const referenceSettings = settingsFor("linear", 0, 0, 12);
    const trialSettings = {
      ...settingsFor(
        ui.renderer.value, Number(ui.baseExposure.value), Number(ui.participantExposure.value),
        ["linear", "balanced"].includes(ui.renderer.value) ? Number(ui.contrast.value) : 0,
        ui.renderer.value === "balanced" ? Number(ui.balance.value) : 0
      ),
      tones: readTones()
    };
    const rotationQuarterTurns = state.rotationQuarterTurns;
    ui.status.textContent = "Developing comparison…";
    if (includeReference || !state.referenceRecord) {
      const reference = await processor.develop(state.base, state.participant, ui.referenceCanvas, referenceSettings);
      if (state.disposed) return;
      state.referenceUrl = URL.createObjectURL(reference.blob);
      state.referenceBlob = reference.blob;
      state.referenceRecord = renderRecord(referenceSettings, reference);
      ui.referenceCanvas.hidden = false;
      ui.referenceEmpty.hidden = true;
    }
    let trial = await processor.develop(state.base, state.participant, ui.canvas, trialSettings);
    if (state.disposed) return;
    if (rotationQuarterTurns) trial = await rotateExposureCanvas(ui.canvas, rotationQuarterTurns);
    if (state.disposed) return;
    state.neutralPixels = ui.canvas.getContext("2d").getImageData(0, 0, trial.width, trial.height);
    state.neutralBlob = trial.blob;
    state.neutralSettings = { ...trialSettings };
    await showTonePreview(trialSettings.tones, true);
  }
  async function choosePhoto(key, input) {
    const file = input.files?.[0];
    if (!file || state.working || state.disposed) return;
    state.rotationQuarterTurns = 0;
    clearError();
    clearResults();
    setWorking(true);
    ui.status.textContent = "Preparing photograph…";
    processor.releasePhoto(state[key]);
    state[key] = null;
    try {
      const photo = await processor.loadPhoto(file);
      if (state.disposed) { processor.releasePhoto(photo); return; }
      state[key] = photo;
      photo.sourceRecord = await sourceRecord(file, photo);
      if (state.disposed) return;
      if (!state.base || !state.participant) {
        ui.status.textContent = `Selected “${photo.name}”. Choose ${state.base ? "a second" : "your base"} photo.`;
        return;
      }
      await renderResults(true);
    } catch (error) {
      if (!state.disposed) reportError(error);
    } finally {
      input.value = "";
      setWorking(false);
    }
  }
  async function changeSettings(includeReference = false) {
    if (state.working || state.disposed) return;
    updateReadouts();
    updateTreatmentControls();
    updateTrialTitle();
    clearError();
    clearResults(includeReference);
    if (!state.base || !state.participant) {
      ui.status.textContent = "Choose a base photo and a second photo.";
      return;
    }
    setWorking(true);
    try { await renderResults(includeReference); }
    catch (error) { if (!state.disposed) reportError(error); }
    finally { setWorking(false); }
  }
  function download(url, filename) {
    if (!url || state.working || state.disposed) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
  }
  function resultFilename(record) {
    const ev = (value) => `${value < 0 ? "minus" : value > 0 ? "plus" : ""}${Math.abs(value)}`;
    const stamp = state.completed.generatedAt.replace(/\D/g, "");
    return `double-exposure-${record.renderer}-base-${ev(record.settings.baseExposure)}EV-second-${ev(record.settings.participantExposure)}EV-${record.settings.monochrome ? "bw" : "colour"}-${stamp}.jpg`;
  }

  ui.base.addEventListener("change", () => choosePhoto("base", ui.base));
  ui.participant.addEventListener("change", () => choosePhoto("participant", ui.participant));
  ui.baseCamera.addEventListener("change", () => choosePhoto("base", ui.baseCamera));
  ui.participantCamera.addEventListener("change", () => choosePhoto("participant", ui.participantCamera));
  for (const slider of [ui.baseExposure, ui.participantExposure, ui.contrast, ui.balance]) {
    slider.addEventListener("input", updateReadouts);
    slider.addEventListener("change", () => changeSettings());
  }
  for (const input of toneInputs) {
    input.addEventListener("input", () => changeTones());
    input.addEventListener("change", () => changeTones(true));
  }
  ui.renderer.addEventListener("change", () => changeSettings());
  ui.monochrome.addEventListener("change", () => changeSettings(true));
  ui.tonesReset.addEventListener("click", () => {
    if (state.working || !state.neutralPixels) return;
    for (const { input } of toneControls) input.value = "0";
    return changeTones(true);
  });
  ui.rotate.addEventListener("click", async () => {
    if (!state.completed || state.working || state.exportPending || state.disposed || !state.neutralPixels) return;
    clearError();
    setWorking(true);
    ui.status.textContent = "Rotating…";
    const prepared = document.createElement("canvas");
    try {
      prepared.width = state.neutralPixels.width;
      prepared.height = state.neutralPixels.height;
      const preparedContext = prepared.getContext("2d");
      preparedContext.putImageData(state.neutralPixels, 0, 0);
      const result = await rotateExposureCanvas(prepared);
      if (state.disposed) return;
      const neutralPixels = preparedContext.getImageData(0, 0, result.width, result.height);
      const settings = state.completed.trial.settings;
      const { pixels, neutral } = tonePixels(settings.tones, neutralPixels);
      preparedContext.putImageData(pixels, 0, 0);
      const blob = neutral ? result.blob : await canvasBlob(prepared);
      if (state.disposed) return;
      const rotationQuarterTurns = (state.rotationQuarterTurns + 1) % 4;
      const recipe = recipeFor(settings, pixels, rotationQuarterTurns);
      // Prepare the complete export before changing the preview or its cache.
      saveDownload(blob, recipe);
      invalidateToneExport();
      state.neutralPixels = neutralPixels;
      state.neutralBlob = result.blob;
      state.rotationQuarterTurns = rotationQuarterTurns;
      ui.canvas.width = pixels.width;
      ui.canvas.height = pixels.height;
      ui.canvas.getContext("2d").putImageData(pixels, 0, 0);
      updateTrialTitle(settings);
      ui.status.textContent = "Trial rotated. Downloads use this orientation.";
    } catch (error) {
      if (!state.disposed) {
        ui.error.textContent = error instanceof Error ? error.message : "The image could not be rotated.";
        ui.error.hidden = false;
        ui.status.textContent = "Your previous result is still available. Try rotating again.";
      }
    } finally {
      prepared.width = prepared.height = 1;
      setWorking(false);
    }
  });
  ui.reset.addEventListener("click", () => {
    if (state.working) return;
    ui.renderer.value = "balanced";
    ui.balance.value = "20";
    ui.contrast.value = "12";
    ui.baseExposure.value = ui.participantExposure.value = "0";
    state.rotationQuarterTurns = 0;
    for (const { input } of toneControls) input.value = "0";
    return changeSettings();
  });
  ui.download.addEventListener("click", () => {
    if (state.completed && !state.exportPending) download(state.resultUrl, resultFilename(state.completed.trial));
  });
  ui.referenceDownload.addEventListener("click", () => {
    if (state.completed) download(state.referenceUrl, resultFilename(state.completed.reference));
  });
  ui.settingsDownload.addEventListener("click", () => {
    if (state.completed && !state.exportPending) download(state.settingsUrl, `double-exposure-comparison-${state.completed.generatedAt.replace(/\D/g, "")}-settings.json`);
  });
  window.addEventListener("pagehide", (event) => {
    if (event.persisted) return;
    state.disposed = true;
    clearResults();
    processor.releasePhoto(state.base);
    processor.releasePhoto(state.participant);
  });
  updateReadouts();
  updateTreatmentControls();
  updateTrialTitle();
  return Object.freeze({
    snapshot(kind) {
      if (state.working || state.disposed || !state.completed || (kind !== "reference" && kind !== "trial")) return null;
      if (kind === "trial" && state.exportPending) return null;
      const blob = kind === "reference" ? state.referenceBlob : state.resultBlob;
      const record = kind === "reference" ? state.completed.reference : state.completed.trial;
      return blob && record ? Object.freeze({ blob, width: record.width, height: record.height,
        filename: resultFilename(record) }) : null;
    },
    subscribe(listener) {
      outputListeners.add(listener);
      listener();
      return () => outputListeners.delete(listener);
    }
  });
}

window.LocalExposureTest = initializeLocalExposureTest();
