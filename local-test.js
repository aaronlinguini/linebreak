"use strict";

// This page uses the production processor, without an archive connection.
function initializeLocalExposureTest() {
  const byId = (id) => document.getElementById(id);
  const ui = {
    workspace: byId("test-workspace"), canvas: byId("test-canvas"),
    empty: byId("test-empty"), busy: byId("test-busy"),
    base: byId("test-base"), participant: byId("test-participant"),
    download: byId("test-download"), status: byId("test-status"), error: byId("test-error")
  };
  const processor = createExposureProcessor();
  const state = { base: null, participant: null, working: false, resultUrl: null };

  function clearResult() {
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
    state.resultUrl = null;
    ui.canvas.hidden = true;
    ui.canvas.width = ui.canvas.height = 1;
    ui.empty.hidden = false;
    ui.download.hidden = true;
    ui.download.disabled = true;
  }

  function setWorking(value) {
    state.working = value;
    ui.base.disabled = ui.participant.disabled = value;
    ui.busy.hidden = !value;
    ui.workspace.setAttribute("aria-busy", String(value));
  }

  async function choosePhoto(key, input) {
    const file = input.files?.[0];
    if (!file || state.working) return;
    ui.error.hidden = true;
    ui.error.textContent = "";
    clearResult();
    setWorking(true);
    ui.status.textContent = "Preparing photograph…";
    try {
      const photo = await processor.loadPhoto(file);
      processor.releasePhoto(state[key]);
      state[key] = photo;
      if (!state.base || !state.participant) {
        ui.status.textContent = `Selected “${photo.name}”. Choose ${state.base ? "a second" : "your base"} photo.`;
        return;
      }
      ui.status.textContent = "Developing…";
      const result = await processor.develop(state.base, state.participant, ui.canvas, PROJECT_SETTINGS);
      state.resultUrl = URL.createObjectURL(result.blob);
      ui.canvas.hidden = false;
      ui.empty.hidden = true;
      ui.download.hidden = false;
      ui.download.disabled = false;
      ui.status.textContent = "Ready. Change either photo to try another combination.";
    } catch (error) {
      ui.error.textContent = error instanceof Error ? error.message : "The photographs could not be processed.";
      ui.error.hidden = false;
      ui.status.textContent = "Choose a photograph to try again.";
    } finally {
      input.value = "";
      setWorking(false);
    }
  }

  ui.base.addEventListener("change", () => choosePhoto("base", ui.base));
  ui.participant.addEventListener("change", () => choosePhoto("participant", ui.participant));
  ui.download.addEventListener("click", () => {
    if (!state.resultUrl || state.working) return;
    const link = document.createElement("a");
    link.href = state.resultUrl;
    link.download = "double-exposure-test.jpg";
    document.body.append(link);
    link.click();
    link.remove();
  });
  window.addEventListener("pagehide", (event) => {
    if (event.persisted) return;
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
    processor.releasePhoto(state.base);
    processor.releasePhoto(state.participant);
  });
}

initializeLocalExposureTest();
