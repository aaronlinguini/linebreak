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
  elements.get("test-balance").value = html.match(/<input\b[^>]*id="test-balance"[^>]*\bvalue="([^"]+)"/)?.[1] ?? "";
  const toneKeys = ["shadows", "highlights", "mids", "whites", "blacks"];
  for (const key of toneKeys) elements.get(`test-${key}`).value = "0";
  const renders = [];
  const processing = [];
  const toneRequests = [];
  const mixers = [];
  function makeMixer(renderer) {
    const mix = (base, participant, output, start = 0, end = output.length) => {
      processing.push({ kind: "mix", renderer, start, end });
      output.fill(10, start, end);
    };
    mixers.push(mix);
    return mix;
  }
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
      createRevisedMixer() { return makeMixer("revised"); },
      createSmoothMixer() { return makeMixer("smooth"); },
      createMixer() { return makeMixer("film"); }
    },
    ExposureMath: {
      balancedVersion: "overlap-suppression-v2",
      balancedParameters: { maximumPower: 4 },
      createMixer() { return makeMixer("linear"); },
      createBalancedMixer() { return makeMixer("balanced"); }
    },
    ToneAdjustments: {
      version: "tone-curve-v1",
      createMapper(tones) {
        toneRequests.push(tones ? JSON.parse(JSON.stringify(tones)) : null);
        if (!tones || Object.values(tones).every((value) => value === 0)) return null;
        const snapshot = JSON.parse(JSON.stringify(tones));
        return (output, start, end) => {
          assert.equal(output[start], 10, "tone adjustments must follow the selected mixer");
          processing.push({ kind: "tone", tones: snapshot, start, end });
          output.fill(11, start, end);
        };
      }
    },
    createExposureProcessor({ mixerFactory }) {
      return {
        async loadPhoto(file) {
          if (file.invalid) throw new Error("Unreadable photo.");
          return { name: file.name, width: 600, height: 400, originalWidth: 400, originalHeight: 600 };
        },
        releasePhoto() {},
        async develop(base, participant, canvas, settings) {
          const mixer = mixerFactory(settings);
          const neutral = !settings.tones || Object.values(settings.tones).every((value) => value === 0);
          if (neutral) assert.equal(mixer, mixers.at(-1), "neutral tones must bypass the postprocessing wrapper");
          const output = new Uint8ClampedArray(12);
          mixer(new Uint8ClampedArray(12), new Uint8ClampedArray(12), output, 4, 8);
          assert.equal(processing.filter(({ kind }) => kind === "mix").at(-1).renderer, settings.renderer);
          assert.deepEqual(Array.from(output.slice(0, 4)), [0,0,0,0]);
          assert.deepEqual(Array.from(output.slice(8)), [0,0,0,0]);
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
  return { elements, renders, processing, toneRequests, downloads, urls, revoked, fire, select, pair, recipe, pageListeners, blockNext(gate) { nextGate = gate; } };
}

test("trial settings affect only the trial, and downloads identify the completed treatment", async () => {
  const h = harness();
  await h.pair();
  assert.equal(h.renders.length, 2);
  assert.deepEqual(h.renders.map(({ renderer, baseExposure, participantExposure }) => [renderer, baseExposure, participantExposure]), [["linear",0,0], ["balanced",0,0]]);
  assert.equal(h.elements.get("test-monochrome").checked, true);
  assert.equal(h.renders[0].contrast, 12);
  assert.equal(h.renders[0].balanceStrength, 0);
  assert.equal(h.renders[1].contrast, 12);
  assert.equal(h.renders[1].balanceStrength, 20);
  assert.equal(h.elements.get("test-contrast-control").hidden, false);
  assert.equal(h.elements.get("test-balance-control").hidden, false);

  h.elements.get("test-base-exposure").value = "-0.5";
  await h.fire("test-base-exposure");
  assert.equal(h.renders.length, 3, "an exposure change must not redevelop the fixed reference");
  assert.equal(h.renders[2].baseExposure, -0.5);
  assert.equal(h.renders[2].participantExposure, 0);
  const recipe = await h.recipe();
  assert.equal(recipe.schemaVersion, 1);
  assert.equal(recipe.reference.settings.baseExposure, 0);
  assert.equal(recipe.trial.settings.baseExposure, -0.5);
  assert.equal(recipe.trial.rendererVersion, "overlap-suppression-v2");
  assert.equal(recipe.reference.rendererVersion, "linear-addition-c6a65ba");
  assert.equal(recipe.reference.settings.contrast, 12);
  assert.equal(recipe.trial.settings.contrast, 12);
  assert.equal(recipe.trial.settings.balanceStrength, 20);
  assert.deepEqual(recipe.trial.modelParameters, { maximumPower: 4 });
  assert.equal(recipe.sources.base.name, "base.jpg");
  assert.equal(recipe.sources.base.originalWidth, 400);
  assert.equal(recipe.sources.base.workingWidth, 600);

  await h.fire("test-download", "click");
  assert.match(h.downloads.at(-1).filename, /^double-exposure-balanced-base-minus0\.5EV-second-0EV-bw-\d+\.jpg$/);
  await h.fire("test-reference-download", "click");
  assert.match(h.downloads.at(-1).filename, /^double-exposure-linear-base-0EV-second-0EV-bw-\d+\.jpg$/);
});

test("contrast changes only the trial and the saved additive settings match the reference recipe", async () => {
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
  assert.equal(recipe.reference.settings.contrast, 12);
  assert.equal(recipe.trial.settings.contrast, 24);
  assert.match(h.elements.get("trial-title").textContent, /contrast 24/);
  h.elements.get("test-contrast").value = "0";
  await h.fire("test-contrast");
  recipe = await h.recipe();
  assert.equal(recipe.trial.settings.contrast, 0);
  assert.equal(recipe.reference.settings.contrast, 12);
  h.elements.get("test-renderer").value = "linear";
  h.elements.get("test-contrast").value = "12";
  await h.fire("test-renderer");
  recipe = await h.recipe();
  const { tones, ...untuned } = recipe.trial.settings;
  assert.deepEqual(untuned, recipe.reference.settings);
});

test("treatment controls apply contrast to both additive methods and balance only to the new method", async () => {
  const h = harness();
  await h.pair();
  for (const renderer of ["smooth", "revised", "film"]) {
    h.elements.get("test-renderer").value = renderer;
    await h.fire("test-renderer");
    assert.equal(h.elements.get("test-contrast-control").hidden, true);
    assert.equal(h.elements.get("test-contrast").disabled, true);
    assert.equal(h.elements.get("test-balance-control").hidden, true);
    assert.equal(h.elements.get("test-balance").disabled, true);
    assert.equal(h.renders.at(-1).contrast, 0);
    assert.equal(h.renders.at(-1).balanceStrength, 0);
  }
  h.elements.get("test-renderer").value = "linear";
  await h.fire("test-renderer");
  assert.equal(h.elements.get("test-contrast-control").hidden, false);
  assert.equal(h.elements.get("test-contrast").disabled, false);
  assert.equal(h.renders.at(-1).contrast, 12);
  assert.equal(h.elements.get("test-balance-control").hidden, true);
  assert.equal(h.elements.get("test-balance").disabled, true);
  assert.equal(h.renders.at(-1).balanceStrength, 0);
  h.elements.get("test-renderer").value = "balanced";
  await h.fire("test-renderer");
  assert.equal(h.elements.get("test-contrast-control").hidden, false);
  assert.equal(h.elements.get("test-contrast").disabled, false);
  assert.equal(h.elements.get("test-balance-control").hidden, false);
  assert.equal(h.elements.get("test-balance").disabled, false);
  assert.equal(h.renders.at(-1).balanceStrength, 20);
});

test("the balance slider changes only the trial and records its completed strength", async () => {
  const h = harness();
  await h.pair();
  const completedTitle = h.elements.get("trial-title").textContent;
  h.elements.get("test-balance").value = "50";
  await h.fire("test-balance", "input");
  assert.equal(h.elements.get("test-balance-value").textContent, "50%");
  assert.equal(h.elements.get("trial-title").textContent, completedTitle);
  assert.equal(h.renders.length, 2);
  let recipe = await h.recipe();
  assert.equal(recipe.trial.settings.balanceStrength, 20);
  await h.fire("test-balance");
  assert.equal(h.renders.length, 3, "balance must not redevelop the fixed saved reference");
  recipe = await h.recipe();
  assert.equal(recipe.trial.settings.balanceStrength, 50);
  assert.equal(recipe.reference.settings.balanceStrength, 0);
  assert.match(h.elements.get("trial-title").textContent, /50%/);
  h.elements.get("test-balance").value = "0";
  await h.fire("test-balance");
  recipe = await h.recipe();
  const { tones, ...untuned } = recipe.trial.settings;
  assert.deepEqual({ ...untuned, renderer: "linear" }, recipe.reference.settings);
});

test("neutral tone controls preserve the original mixer and leave the reference unadjusted", async () => {
  const h = harness();
  await h.pair();
  const zero = { shadows: 0, highlights: 0, mids: 0, whites: 0, blacks: 0 };
  assert.equal(h.renders[0].tones, undefined);
  assert.deepEqual(h.renders[1].tones, zero);
  assert.equal(h.processing.filter(({ kind }) => kind === "tone").length, 0);
  const recipe = await h.recipe();
  assert.equal(recipe.reference.settings.tones, undefined);
  assert.equal(recipe.reference.postProcessing, undefined);
  assert.deepEqual(recipe.trial.postProcessing, { version: "tone-curve-v1", tones: zero });
});

test("tone readouts wait for commit and postprocessing runs after each selected mixer on the same chunk", async () => {
  const h = harness();
  await h.pair();
  const title = h.elements.get("trial-title").textContent;
  h.elements.get("test-shadows").value = "30";
  await h.fire("test-shadows", "input");
  assert.equal(h.elements.get("test-shadows-value").textContent, "+30");
  assert.equal(h.elements.get("trial-title").textContent, title);
  assert.equal(h.renders.length, 2);
  assert.equal((await h.recipe()).trial.settings.tones.shadows, 0);
  for (const renderer of ["balanced", "linear", "revised", "smooth", "film"]) {
    h.elements.get("test-renderer").value = renderer;
    await h.fire("test-renderer");
    const [mix, tones] = h.processing.slice(-2);
    assert.deepEqual(mix, { kind: "mix", renderer, start: 4, end: 8 });
    assert.equal(tones.kind, "tone");
    assert.equal(tones.start, mix.start);
    assert.equal(tones.end, mix.end);
    assert.equal(tones.tones.shadows, 30);
    const recipe = await h.recipe();
    assert.equal(recipe.trial.postProcessing.tones.shadows, 30);
    assert.equal(recipe.reference.postProcessing, undefined);
  }
  assert.equal(h.renders.filter(({ tones }) => !tones).length, 1, "tone changes must not regenerate the reference");
});

test("reset tones clears only the five finishing controls and preserves the selected blend", async () => {
  const h = harness();
  await h.pair();
  h.elements.get("test-balance").value = "35";
  h.elements.get("test-contrast").value = "18";
  h.elements.get("test-base-exposure").value = "-0.5";
  h.elements.get("test-participant-exposure").value = "0.5";
  for (const [key, value] of Object.entries({ shadows: 30, highlights: -20, mids: 10, whites: -15, blacks: 5 })) {
    h.elements.get(`test-${key}`).value = String(value);
  }
  await h.fire("test-shadows");
  const { tones: beforeTones, ...beforeBlend } = h.renders.at(-1);
  const rendersBeforeReset = h.renders.length;
  await h.fire("test-tones-reset", "click");
  const { tones, ...afterBlend } = h.renders.at(-1);
  assert.deepEqual(afterBlend, beforeBlend);
  assert.deepEqual(tones, { shadows: 0, highlights: 0, mids: 0, whites: 0, blacks: 0 });
  assert.equal(h.renders.length, rendersBeforeReset + 1);
  for (const key of Object.keys(tones)) assert.equal(h.elements.get(`test-${key}-value`).textContent, "0");
});

test("tone settings remain attached to their rendered image while a render is in flight", async () => {
  const h = harness();
  await h.pair();
  let resume;
  h.blockNext(new Promise((resolve) => { resume = resolve; }));
  h.elements.get("test-shadows").value = "30";
  const pending = h.fire("test-shadows");
  for (const key of ["shadows", "highlights", "mids", "whites", "blacks"]) {
    assert.equal(h.elements.get(`test-${key}`).disabled, true);
  }
  assert.equal(h.elements.get("test-tones-reset").disabled, true);
  h.elements.get("test-shadows").value = "70";
  await h.fire("test-shadows");
  assert.equal(h.renders.length, 3);
  resume();
  await pending;
  const recipe = await h.recipe();
  assert.equal(recipe.trial.settings.tones.shadows, 30);
  assert.equal(recipe.trial.postProcessing.tones.shadows, 30);
  assert.equal(h.elements.get("test-shadows").disabled, false);
  assert.equal(h.elements.get("test-tones-reset").disabled, false);
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

test("colour selection regenerates both images, while reset restores balance, contrast and exposure", async () => {
  const h = harness();
  await h.pair();
  h.elements.get("test-monochrome").checked = false;
  await h.fire("test-monochrome");
  assert.equal(h.renders.length, 4);
  assert.ok(h.renders.slice(2).every((settings) => settings.monochrome === false));
  h.elements.get("test-renderer").value = "revised";
  h.elements.get("test-contrast").value = "28";
  h.elements.get("test-balance").value = "25";
  h.elements.get("test-base-exposure").value = "1";
  h.elements.get("test-mids").value = "40";
  await h.fire("test-renderer");
  assert.equal(h.renders.at(-1).renderer, "revised");
  assert.equal(h.renders.at(-1).contrast, 0);
  assert.equal(h.elements.get("test-contrast-control").hidden, true);
  await h.fire("test-reset", "click");
  assert.equal(h.renders.at(-1).renderer, "balanced");
  assert.equal(h.renders.at(-1).contrast, 12);
  assert.equal(h.renders.at(-1).balanceStrength, 20);
  assert.equal(h.elements.get("test-contrast-control").hidden, false);
  assert.equal(h.elements.get("test-balance-control").hidden, false);
  assert.equal(h.renders.at(-1).baseExposure, 0);
  assert.equal(h.renders.at(-1).participantExposure, 0);
  assert.equal(h.renders.at(-1).monochrome, false);
  assert.deepEqual(h.renders.at(-1).tones, { shadows: 0, highlights: 0, mids: 0, whites: 0, blacks: 0 });
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
  assert.equal(h.elements.get("test-balance").disabled, true);
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
  assert.deepEqual(h.renders.slice(-2).map((settings) => settings.renderer), ["linear", "balanced"]);
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
