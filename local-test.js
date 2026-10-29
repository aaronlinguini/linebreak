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
    settingsDownload: byId("test-settings-download"),
    renderer: byId("test-renderer"), baseExposure: byId("test-base-exposure"),
    participantExposure: byId("test-participant-exposure"), monochrome: byId("test-monochrome"),
    baseValue: byId("test-base-value"), participantValue: byId("test-participant-value"),
    reset: byId("test-reset"), trialTitle: byId("trial-title"),
    status: byId("test-status"), error: byId("test-error")
  };
  const processor = createExposureProcessor({
    mixerFactory(settings) {
      return settings.renderer === "film"
        ? FilmExposureMath.createMixer(settings)
        : ExposureMath.createMixer(settings);
    }
  });
  const state = {
    base: null, participant: null, working: false, disposed: false,
    resultUrl: null, referenceUrl: null, settingsUrl: null,
    referenceRecord: null, completed: null
  };
  const controls = [ui.base, ui.participant, ui.baseCamera, ui.participantCamera, ui.renderer, ui.baseExposure, ui.participantExposure, ui.monochrome, ui.reset];
  ui.monochrome.checked = PROJECT_SETTINGS.monochrome;

  function evLabel(value) {
    const number = Number(value);
    return `${number < 0 ? "−" : number > 0 ? "+" : ""}${Math.abs(number)} EV`;
  }
  function updateReadouts() {
    ui.baseValue.textContent = evLabel(ui.baseExposure.value);
    ui.participantValue.textContent = evLabel(ui.participantExposure.value);
  }
  function updateTrialTitle(settings = { renderer: ui.renderer.value, baseExposure: Number(ui.baseExposure.value), participantExposure: Number(ui.participantExposure.value) }) {
    ui.trialTitle.textContent = `Trial · ${settings.renderer === "film" ? "film curve" : "current addition"} · ${evLabel(settings.baseExposure)} / ${evLabel(settings.participantExposure)}`;
  }
  function settingsFor(renderer, baseExposure, participantExposure) {
    return {
      ...PROJECT_SETTINGS, renderer, baseExposure, participantExposure,
      contrast: 0, filmContrast: 1, monochrome: ui.monochrome.checked
    };
  }
  function releaseUrl(key) {
    if (state[key]) URL.revokeObjectURL(state[key]);
    state[key] = null;
  }
  function updateDownloads() {
    for (const [button, url] of [[ui.download, state.resultUrl], [ui.referenceDownload, state.referenceUrl], [ui.settingsDownload, state.settingsUrl]]) {
      button.hidden = !url;
      button.disabled = state.working || !url;
    }
  }
  function clearResults(includeReference = true) {
    releaseUrl("resultUrl");
    releaseUrl("settingsUrl");
    state.completed = null;
    ui.canvas.hidden = true;
    ui.canvas.width = ui.canvas.height = 1;
    ui.empty.hidden = false;
    if (includeReference) {
      releaseUrl("referenceUrl");
      state.referenceRecord = null;
      ui.referenceCanvas.hidden = true;
      ui.referenceCanvas.width = ui.referenceCanvas.height = 1;
      ui.referenceEmpty.hidden = false;
    }
    updateDownloads();
  }
  function setWorking(value) {
    state.working = value;
    for (const control of controls) control.disabled = value;
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
  function renderRecord(settings, result) {
    return {
      renderer: settings.renderer,
      rendererVersion: settings.renderer === "film" ? FilmExposureMath.version : "linear-addition-c6a65ba",
      ...(settings.renderer === "film" ? { modelParameters: { ...FilmExposureMath.parameters } } : {}),
      settings: { ...settings }, width: result.width, height: result.height,
      format: "image/jpeg", quality: 0.95
    };
  }
  async function renderResults(includeReference) {
    // Capture all controls before awaiting; the recipe belongs to these outputs.
    const referenceSettings = settingsFor("linear", 0, 0);
    const trialSettings = settingsFor(ui.renderer.value, Number(ui.baseExposure.value), Number(ui.participantExposure.value));
    ui.status.textContent = "Developing comparison…";
    if (includeReference || !state.referenceRecord) {
      const reference = await processor.develop(state.base, state.participant, ui.referenceCanvas, referenceSettings);
      if (state.disposed) return;
      state.referenceUrl = URL.createObjectURL(reference.blob);
      state.referenceRecord = renderRecord(referenceSettings, reference);
      ui.referenceCanvas.hidden = false;
      ui.referenceEmpty.hidden = true;
    }
    const trial = await processor.develop(state.base, state.participant, ui.canvas, trialSettings);
    if (state.disposed) return;
    state.resultUrl = URL.createObjectURL(trial.blob);
    state.completed = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      sources: { base: state.base.sourceRecord, participant: state.participant.sourceRecord },
      preparation: { portraitRotation: "90-degrees-clockwise", fit: "contain-with-black-padding", maxEdge: 2400 },
      reference: state.referenceRecord,
      trial: renderRecord(trialSettings, trial)
    };
    state.settingsUrl = URL.createObjectURL(new Blob([JSON.stringify(state.completed, null, 2)], { type: "application/json" }));
    updateTrialTitle(trialSettings);
    ui.canvas.hidden = false;
    ui.empty.hidden = true;
    ui.status.textContent = "Ready. Compare the images or adjust the trial.";
  }
  async function choosePhoto(key, input) {
    const file = input.files?.[0];
    if (!file || state.working || state.disposed) return;
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
  for (const slider of [ui.baseExposure, ui.participantExposure]) {
    slider.addEventListener("input", updateReadouts);
    slider.addEventListener("change", () => changeSettings());
  }
  ui.renderer.addEventListener("change", () => changeSettings());
  ui.monochrome.addEventListener("change", () => changeSettings(true));
  ui.reset.addEventListener("click", () => {
    if (state.working) return;
    ui.renderer.value = "film";
    ui.baseExposure.value = ui.participantExposure.value = "0";
    return changeSettings();
  });
  ui.download.addEventListener("click", () => {
    if (state.completed) download(state.resultUrl, resultFilename(state.completed.trial));
  });
  ui.referenceDownload.addEventListener("click", () => {
    if (state.completed) download(state.referenceUrl, resultFilename(state.completed.reference));
  });
  ui.settingsDownload.addEventListener("click", () => {
    if (state.completed) download(state.settingsUrl, `double-exposure-comparison-${state.completed.generatedAt.replace(/\D/g, "")}-settings.json`);
  });
  window.addEventListener("pagehide", (event) => {
    if (event.persisted) return;
    state.disposed = true;
    clearResults();
    processor.releasePhoto(state.base);
    processor.releasePhoto(state.participant);
  });
  updateReadouts();
  updateTrialTitle();
}

initializeLocalExposureTest();
