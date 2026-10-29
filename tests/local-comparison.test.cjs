"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "local-test.js"), "utf8");
const html = fs.readFileSync(path.join(root, "local-test.html"), "utf8");

function harness() {
  const elements = new Map();
  const listeners = new Map();
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) {
    elements.set(id, {
      hidden: true, disabled: false, value: "", checked: false, textContent: "", files: [],
      addEventListener(type, handler) { listeners.set(`${id}:${type}`, handler); },
      setAttribute() {}
    });
  }
  const selectedTreatment = [...html.matchAll(/<option\b[^>]*>/g)]
    .map(([tag]) => tag)
    .find((tag) => /\bselected\b/.test(tag));
  elements.get("test-renderer").value = selectedTreatment?.match(/\bvalue="([^"]+)"/)?.[1] ?? "";
  elements.get("test-base-exposure").value = "0";
  elements.get("test-participant-exposure").value = "0";
  elements.get("test-contrast").value = html.match(/<input\b[^>]*id="test-contrast"[^>]*\bvalue="([^"]+)"/)?.[1] ?? "";
  const renders = [];
  const downloads = [];
  const urls = new Map();
  const revoked = [];
  const pageListeners = new Map();
  let nextUrl = 0;
  let nextGate;
  const sandbox = vm.createContext({
    Error, Blob, Date,
    document: {
      getElementById(id) { return elements.get(id); },
      createElement(tag) {
        assert.equal(tag, "a");
        return { click() { downloads.push({ href: this.href, filename: this.download }); }, remove() {} };
      },
      body: { append() {} }
    },
    window: { addEventListener(type, handler) { pageListeners.set(type, handler); } },
    URL: {
      createObjectURL(blob) { const url = `blob:comparison-${++nextUrl}`; urls.set(url, blob); return url; },
      revokeObjectURL(url) { revoked.push(url); }
    },
    PROJECT_SETTINGS: { baseExposure: 0, participantExposure: 0, contrast: 0, monochrome: true },
    FilmExposureMath: {
      version: "assumed-film-v1", parameters: { toe: -7, shoulder: 4 },
      smoothVersion: "smooth-exposure-v1", smoothParameters: { exposurePower: 2, whiteAnchor: 0.98 },
      revisedVersion: "smooth-revised-v1", revisedParameters: { overlapPivot: 0.23, retentionPower: 3.5, maximumColourPower: 7 },
      createRevisedMixer() { return "revised"; },
      createSmoothMixer() { return "smooth"; },
      createMixer() { return "film"; }
    },
    ExposureMath: { createMixer() { return "linear"; } },
    createExposureProcessor({ mixerFactory }) {
      return {
        async loadPhoto(file) {
          if (file.invalid) throw new Error("Unreadable photo.");
          return { name: file.name, width: 600, height: 400, originalWidth: 400, originalHeight: 600 };
        },
        releasePhoto() {},
        async develop(base, participant, canvas, settings) {
          assert.equal(mixerFactory(settings), settings.renderer, "the selected treatment must dispatch to its actual mixer");
          renders.push(JSON.parse(JSON.stringify(settings)));
          const gate = nextGate;
          nextGate = null;
          if (gate) await gate;
          return { blob: new Blob(["jpeg"]), width: 600, height: 400 };
        }
      };
    }
  });
  vm.runInContext(source, sandbox);
  async function fire(id, type = "change") { return listeners.get(`${id}:${type}`)(); }
  async function select(id, name) {
    elements.get(id).files = [{ name, type: "image/jpeg", size: 100 }];
    return fire(id);
  }
  async function pair() {
    await select("test-base", "base.jpg");
    await select("test-participant", "second.jpg");
  }
  async function recipe() {
    await fire("test-settings-download", "click");
    return JSON.parse(await urls.get(downloads.at(-1).href).text());
  }
  return { elements, renders, downloads, urls, revoked, fire, select, pair, recipe, pageListeners, blockNext(gate) { nextGate = gate; } };
}

test("trial settings affect only the trial, and downloads identify the completed treatment", async () => {
  const h = harness();
  await h.pair();
  assert.equal(h.renders.length, 2);
  assert.deepEqual(h.renders.map(({ renderer, baseExposure, participantExposure }) => [renderer, baseExposure, participantExposure]), [["linear",0,0], ["linear",0,0]]);
  assert.equal(h.elements.get("test-monochrome").checked, true);
  assert.equal(h.renders[0].contrast, 0);
  assert.equal(h.renders[1].contrast, 12);
  assert.equal(h.elements.get("test-contrast-control").hidden, false);

  h.elements.get("test-base-exposure").value = "-0.5";
  await h.fire("test-base-exposure");
  assert.equal(h.renders.length, 3, "an exposure change must not redevelop the fixed reference");
  assert.equal(h.renders[2].baseExposure, -0.5);
  assert.equal(h.renders[2].participantExposure, 0);
  const recipe = await h.recipe();
  assert.equal(recipe.schemaVersion, 1);
  assert.equal(recipe.reference.settings.baseExposure, 0);
  assert.equal(recipe.trial.settings.baseExposure, -0.5);
  assert.equal(recipe.trial.rendererVersion, "linear-addition-c6a65ba");
  assert.equal(recipe.reference.settings.contrast, 0);
  assert.equal(recipe.trial.settings.contrast, 12);
  assert.equal(recipe.trial.modelParameters, undefined);
  assert.equal(recipe.sources.base.name, "base.jpg");
  assert.equal(recipe.sources.base.originalWidth, 400);
  assert.equal(recipe.sources.base.workingWidth, 600);

  await h.fire("test-download", "click");
  assert.match(h.downloads.at(-1).filename, /^double-exposure-linear-base-minus0\.5EV-second-0EV-bw-\d+\.jpg$/);
  await h.fire("test-reference-download", "click");
  assert.match(h.downloads.at(-1).filename, /^double-exposure-linear-base-0EV-second-0EV-bw-\d+\.jpg$/);
});

test("contrast changes only the additive trial and zero restores the reference recipe", async () => {
  const h = harness();
  await h.pair();
  const completedTitle = h.elements.get("trial-title").textContent;
  h.elements.get("test-contrast").value = "24";
  await h.fire("test-contrast", "input");
  assert.equal(h.elements.get("test-contrast-value").textContent, "24");
  assert.equal(h.elements.get("trial-title").textContent, completedTitle);
  assert.equal(h.renders.length, 2);
  await h.fire("test-contrast");
  assert.equal(h.renders.length, 3, "contrast must not redevelop the fixed reference");
  let recipe = await h.recipe();
  assert.equal(recipe.reference.settings.contrast, 0);
  assert.equal(recipe.trial.settings.contrast, 24);
  assert.match(h.elements.get("trial-title").textContent, /contrast 24/);
  h.elements.get("test-contrast").value = "0";
  await h.fire("test-contrast");
  recipe = await h.recipe();
  assert.deepEqual(recipe.trial.settings, recipe.reference.settings);
});

test("the contrast control is available only for additive processing", async () => {
  const h = harness();
  await h.pair();
  for (const renderer of ["smooth", "revised", "film"]) {
    h.elements.get("test-renderer").value = renderer;
    await h.fire("test-renderer");
    assert.equal(h.elements.get("test-contrast-control").hidden, true);
    assert.equal(h.elements.get("test-contrast").disabled, true);
    assert.equal(h.renders.at(-1).contrast, 0);
  }
  h.elements.get("test-renderer").value = "linear";
  await h.fire("test-renderer");
  assert.equal(h.elements.get("test-contrast-control").hidden, false);
  assert.equal(h.elements.get("test-contrast").disabled, false);
  assert.equal(h.renders.at(-1).contrast, 12);
});

test("moving a slider updates its readout without relabelling or replacing the completed image", async () => {
  const h = harness();
  await h.pair();
  const completedTitle = h.elements.get("trial-title").textContent;
  h.elements.get("test-base-exposure").value = "1";
  await h.fire("test-base-exposure", "input");
  assert.equal(h.elements.get("test-base-value").textContent, "+1 EV");
  assert.equal(h.elements.get("trial-title").textContent, completedTitle);
  assert.equal(h.renders.length, 2);
  const recipe = await h.recipe();
  assert.equal(recipe.trial.settings.baseExposure, 0);
});

test("colour selection regenerates both images, while reset restores trial treatment, contrast and exposure", async () => {
  const h = harness();
  await h.pair();
  h.elements.get("test-monochrome").checked = false;
  await h.fire("test-monochrome");
  assert.equal(h.renders.length, 4);
  assert.ok(h.renders.slice(2).every((settings) => settings.monochrome === false));
  h.elements.get("test-renderer").value = "revised";
  h.elements.get("test-contrast").value = "28";
  h.elements.get("test-base-exposure").value = "1";
  await h.fire("test-renderer");
  assert.equal(h.renders.at(-1).renderer, "revised");
  assert.equal(h.renders.at(-1).contrast, 0);
  assert.equal(h.elements.get("test-contrast-control").hidden, true);
  await h.fire("test-reset", "click");
  assert.equal(h.renders.at(-1).renderer, "linear");
  assert.equal(h.renders.at(-1).contrast, 12);
  assert.equal(h.elements.get("test-contrast-control").hidden, false);
  assert.equal(h.renders.at(-1).baseExposure, 0);
  assert.equal(h.renders.at(-1).participantExposure, 0);
  assert.equal(h.renders.at(-1).monochrome, false);
});

test("an in-flight render disables controls and saves its own settings snapshot", async () => {
  const h = harness();
  await h.pair();
  let resume;
  h.blockNext(new Promise((resolve) => { resume = resolve; }));
  h.elements.get("test-base-exposure").value = "-2";
  const pending = h.fire("test-base-exposure");
  assert.equal(h.elements.get("test-base").disabled, true);
  assert.equal(h.elements.get("test-participant").disabled, true);
  assert.equal(h.elements.get("test-base-camera").disabled, true);
  assert.equal(h.elements.get("test-participant-camera").disabled, true);
  assert.equal(h.elements.get("test-renderer").disabled, true);
  assert.equal(h.elements.get("test-contrast").disabled, true);
  assert.equal(h.elements.get("test-settings-download").disabled, true);
  h.elements.get("test-base-exposure").value = "2";
  await h.fire("test-base-exposure");
  assert.equal(h.renders.length, 3, "a second event cannot start overlapping processing");
  resume();
  await pending;
  assert.equal(h.elements.get("test-base").disabled, false);
  assert.equal(h.elements.get("test-base-camera").disabled, false);
  assert.equal(h.elements.get("test-participant-camera").disabled, false);
  const recipe = await h.recipe();
  assert.equal(recipe.trial.settings.baseExposure, -2);
  await h.fire("test-download", "click");
  assert.match(h.downloads.at(-1).filename, /base-minus2EV/);
});

test("separate native-camera inputs leave the existing photo-library choices available", () => {
  for (const id of ["test-base", "test-participant"]) {
    const tag = html.match(new RegExp(`<input\\b[^>]*id="${id}"[^>]*>`))[0];
    assert.match(tag, /accept="image\/jpeg,image\/png,image\/webp,image\/avif"/);
    assert.doesNotMatch(tag, /\bcapture\b/);
  }
  for (const id of ["test-base-camera", "test-participant-camera"]) {
    const tag = html.match(new RegExp(`<input\\b[^>]*id="${id}"[^>]*>`))[0];
    assert.match(tag, /accept="image\/jpeg"/);
    assert.match(tag, /capture="environment"/);
    assert.match(html, new RegExp(`<label\\b[^>]*for="${id}"[^>]*>Take (?:base|second) photo<\\/label>`));
  }
});

test("camera captures replace the selected roles through the same comparison pipeline", async () => {
  const h = harness();
  await h.pair();
  h.elements.get("test-monochrome").checked = false;
  await h.fire("test-monochrome");
  h.elements.get("test-base-exposure").value = "-0.5";
  await h.fire("test-base-exposure");
  h.elements.get("test-base-camera").value = "camera-base.jpg";
  await h.select("test-base-camera", "camera-base.jpg");
  assert.equal(h.elements.get("test-base-camera").value, "", "capturing again must trigger a new selection");
  let recipe = await h.recipe();
  assert.equal(recipe.sources.base.name, "camera-base.jpg");
  assert.equal(recipe.sources.participant.name, "second.jpg");
  assert.equal(recipe.sources.base.originalWidth, 400);
  assert.equal(recipe.sources.base.workingWidth, 600);
  assert.equal(recipe.trial.settings.baseExposure, -0.5);
  assert.equal(recipe.trial.settings.monochrome, false);

  h.elements.get("test-participant-camera").value = "camera-second.jpg";
  await h.select("test-participant-camera", "camera-second.jpg");
  recipe = await h.recipe();
  assert.equal(recipe.sources.base.name, "camera-base.jpg");
  assert.equal(recipe.sources.participant.name, "camera-second.jpg");
  assert.equal(h.elements.get("test-participant-camera").value, "");
  assert.deepEqual(h.renders.slice(-2).map((settings) => settings.renderer), ["linear", "linear"]);
});

test("the saved smooth treatment remains selectable with its original model record", async () => {
  const h = harness();
  await h.pair();
  h.elements.get("test-renderer").value = "smooth";
  await h.fire("test-renderer");
  assert.equal(h.renders.at(-1).renderer, "smooth");
  const recipe = await h.recipe();
  assert.equal(recipe.reference.renderer, "linear");
  assert.equal(recipe.trial.rendererVersion, "smooth-exposure-v1");
  assert.deepEqual(recipe.trial.modelParameters, { exposurePower: 2, whiteAnchor: 0.98 });
});

test("the earlier film curve remains selectable and keeps its own model record", async () => {
  const h = harness();
  await h.pair();
  h.elements.get("test-renderer").value = "film";
  await h.fire("test-renderer");
  assert.equal(h.renders.at(-1).renderer, "film");
  const recipe = await h.recipe();
  assert.equal(recipe.reference.renderer, "linear");
  assert.equal(recipe.trial.rendererVersion, "assumed-film-v1");
  assert.deepEqual(recipe.trial.modelParameters, { toe: -7, shoulder: 4 });
});

test("cancelling a camera choice preserves the completed comparison", async () => {
  const h = harness();
  await h.pair();
  h.elements.get("test-base-camera").files = [];
  await h.fire("test-base-camera");
  h.elements.get("test-participant-camera").files = [];
  await h.fire("test-participant-camera");
  assert.equal(h.renders.length, 2);
  assert.equal(h.revoked.length, 0);
  assert.equal(h.elements.get("test-canvas").hidden, false);
  const recipe = await h.recipe();
  assert.equal(recipe.sources.base.name, "base.jpg");
  assert.equal(recipe.sources.participant.name, "second.jpg");
});

test("leaving the page releases all result URLs", async () => {
  const h = harness();
  await h.pair();
  h.pageListeners.get("pagehide")({ persisted: false });
  assert.equal(h.revoked.length, 3);
  assert.equal(h.elements.get("test-download").hidden, true);
  assert.equal(h.elements.get("test-reference-download").hidden, true);
  assert.equal(h.elements.get("test-settings-download").hidden, true);
});
