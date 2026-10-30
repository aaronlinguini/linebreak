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
  const elements = new Map(), listeners = new Map(), timers = new Map();
  const renders = [], processing = [], rotations = [], downloads = [];
  const urls = new Map(), revoked = [], pageListeners = new Map(), encodings = [];
  let nextUrl = 0, nextTimer = 0, nextGate, rotationGate, rotationError = null, holdEncoding = false;
  class FakeImageData {
    constructor(dataOrWidth, widthOrHeight, height) {
      if (typeof dataOrWidth === "number") {
        this.width = dataOrWidth; this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.width = widthOrHeight; this.height = height;
        this.data = new Uint8ClampedArray(dataOrWidth);
      }
    }
  }
  function canvas(element = {}) {
    let width = 1, height = 1, pixels = new Uint8ClampedArray(4);
    Object.defineProperties(element, {
      width: { get: () => width, set(value) { width = value; pixels = new Uint8ClampedArray(width * height * 4); } },
      height: { get: () => height, set(value) { height = value; pixels = new Uint8ClampedArray(width * height * 4); } }
    });
    const context = {
      getImageData() { return new FakeImageData(pixels, width, height); },
      putImageData(image) { pixels = new Uint8ClampedArray(image.data); },
      drawImage(source) { pixels = source.getContext("2d").getImageData().data; }
    };
    element.getContext = () => context;
    element.toBlob = (callback, type, quality) => {
      const snapshot = { pixels: Array.from(pixels), width, height };
      const blob = new Blob([JSON.stringify(snapshot)], { type });
      const request = { snapshot, quality, callback: () => callback(blob) };
      encodings.push(request);
      if (!holdEncoding) request.callback();
    };
    return element;
  }
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) {
    const element = {
      hidden: true, disabled: false, value: "", checked: false, textContent: "", files: [],
      addEventListener(type, handler) { listeners.set(`${id}:${type}`, handler); }, setAttribute() {}
    };
    elements.set(id, id.endsWith("canvas") ? canvas(element) : element);
  }
  const selected = [...html.matchAll(/<option\b[^>]*>/g)].map(([tag]) => tag).find((tag) => /\bselected\b/.test(tag));
  elements.get("test-renderer").value = selected?.match(/\bvalue="([^"]+)"/)?.[1] ?? "";
  for (const id of ["test-base-exposure", "test-participant-exposure", "test-contrast", "test-balance", ...["shadows","highlights","mids","whites","blacks"].map((key) => `test-${key}`)]) {
    elements.get(id).value = html.match(new RegExp(`<input\\b[^>]*id="${id}"[^>]*\\bvalue="([^"]+)"`))?.[1] ?? "0";
  }
  const gradient = Array.from({ length: 24 }, (_, index) => {
    const byte = [0,12,32,56,96,128,160,200,224,242,252,255][index % 12];
    return [byte,byte,byte,255];
  }).flat();
  function makeMixer(renderer) {
    return (base, participant, output, start = 0, end = output.length) => {
      processing.push({ renderer, start, end });
      output.set(gradient.slice(start, end), start);
    };
  }
  const sandbox = vm.createContext({
    Error, Blob, Date, Uint8ClampedArray, ImageData: FakeImageData,
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    document: {
      getElementById(id) { return elements.get(id); },
      createElement(tag) {
        if (tag === "canvas") return canvas();
        assert.equal(tag, "a");
        return { click() { downloads.push({ href: this.href, filename: this.download }); }, remove() {} };
      }, body: { append() {} }
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
      createSmoothMixer() { return makeMixer("smooth"); }, createMixer() { return makeMixer("film"); }
    },
    ExposureMath: {
      balancedVersion: "overlap-suppression-v2", balancedParameters: { maximumPower: 4 },
      createMixer() { return makeMixer("linear"); }, createBalancedMixer() { return makeMixer("balanced"); }
    },
    async rotateExposureCanvas(target, quarterTurns = 1) {
      rotations.push({ canvas: target, quarterTurns });
      const gate = rotationGate; rotationGate = null;
      if (gate) await gate;
      if (rotationError) throw rotationError;
      let image = target.getContext("2d").getImageData();
      for (let turn = 0; turn < quarterTurns % 4; turn++) {
        const rotated = new FakeImageData(image.height, image.width);
        for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
          const sourceIndex = (y * image.width + x) * 4;
          const destination = (x * image.height + image.height - 1 - y) * 4;
          rotated.data.set(image.data.slice(sourceIndex, sourceIndex + 4), destination);
        }
        image = rotated;
      }
      target.width = image.width; target.height = image.height;
      target.getContext("2d").putImageData(image);
      const blob = new Blob([JSON.stringify({ pixels: Array.from(image.data), width: image.width, height: image.height })], { type: "image/jpeg" });
      return { blob, width: image.width, height: image.height };
    },
    createExposureProcessor({ mixerFactory }) {
      return {
        async loadPhoto(file) {
          if (file.invalid) throw new Error("Unreadable photo.");
          return { name: file.name, width: 600, height: 400, originalWidth: 400, originalHeight: 600 };
        }, releasePhoto() {},
        async develop(base, participant, target, settings) {
          const output = new Uint8ClampedArray(gradient.length);
          mixerFactory(settings)(output, output, output, 0, output.length);
          assert.equal(processing.at(-1).renderer, settings.renderer);
          renders.push(JSON.parse(JSON.stringify(settings)));
          const gate = nextGate; nextGate = null;
          if (gate) await gate;
          target.width = 6; target.height = 4;
          target.getContext("2d").putImageData(new FakeImageData(output, 6, 4));
          return { blob: new Blob([JSON.stringify({ pixels: Array.from(output), width: 6, height: 4 })], { type: "image/jpeg" }), width: 6, height: 4 };
        }
      };
    }
  });
  vm.runInContext(fs.readFileSync(path.join(root, "tone-adjustments.js"), "utf8"), sandbox);
  vm.runInContext(source, sandbox);
  async function fire(id, type = "change") { return listeners.get(`${id}:${type}`)(); }
  async function select(id, name) { elements.get(id).files = [{ name, type: "image/jpeg", size: 100 }]; return fire(id); }
  async function pair() { await select("test-base", "base.jpg"); await select("test-participant", "second.jpg"); }
  async function recipe() {
    assert.equal(elements.get("test-settings-download").disabled, false, "only completed exports may be downloaded");
    await fire("test-settings-download", "click");
    return JSON.parse(await urls.get(downloads.at(-1).href).text());
  }
  const pixels = () => Array.from(elements.get("test-canvas").getContext("2d").getImageData().data);
  async function flushTimers() { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } await new Promise(setImmediate); }
  return { elements, renders, processing, rotations, downloads, urls, revoked, fire, select, pair, recipe, pixels, pageListeners, gradient, encodings, flushTimers,
    holdEncoding(value = true) { holdEncoding = value; }, releaseEncoding(index) { encodings[index].callback(); },
    async settle() { await new Promise(setImmediate); },
    blockNext(gate) { nextGate = gate; }, blockRotation(gate) { rotationGate = gate; }, failRotation(error) { rotationError = error; }
  };
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
  assert.deepEqual(h.pixels(), h.gradient, "neutral finishing must preserve every original output byte");
  const recipe = await h.recipe();
  assert.equal(recipe.reference.settings.tones, undefined);
  assert.equal(recipe.reference.postProcessing, undefined);
  assert.deepEqual(recipe.trial.postProcessing, { version: "tone-curve-v1", tones: zero });
});

test("every tone slider repaints real pixels on input without recomposing or accumulating changes", async () => {
  const h = harness();
  assert.equal(h.elements.get("test-mids").disabled, true);
  await h.pair();
  const neutral = h.pixels();
  for (const key of ["shadows", "highlights", "mids", "whites", "blacks"]) {
    h.elements.get(`test-${key}`).value = "70";
    await h.fire(`test-${key}`, "input");
    assert.notDeepEqual(h.pixels(), neutral, `${key} input must immediately change visible pixels`);
    const once = h.pixels();
    await h.fire(`test-${key}`, "input");
    assert.deepEqual(h.pixels(), once, "repeated input must start from the neutral cache");
    assert.equal(h.elements.get(`test-${key}-value`).textContent, "+70");
    assert.equal(h.elements.get(`test-${key}`).disabled, false);
    assert.equal(h.elements.get("test-download").disabled, true);
    assert.equal(h.elements.get("test-settings-download").disabled, true);
    assert.equal(h.elements.get("test-rotate").disabled, true);
    await h.fire(`test-${key}`);
    assert.equal((await h.recipe()).trial.settings.tones[key], 70);
    assert.equal(h.renders.length, 2, "finishing controls must not rerun either exposure");
    await h.fire("test-tones-reset", "click");
    assert.deepEqual(h.pixels(), neutral, "neutral reset must restore exact cached pixels");
    assert.equal(h.renders.length, 2);
  }
});

test("live tone finishing remains separate from every selected exposure mixer", async () => {
  const h = harness();
  await h.pair();
  for (const renderer of ["balanced", "linear", "revised", "smooth", "film"]) {
    h.elements.get("test-renderer").value = renderer;
    await h.fire("test-renderer");
    const renders = h.renders.length;
    h.elements.get("test-mids").value = "50";
    await h.fire("test-mids");
    const recipe = await h.recipe();
    assert.equal(recipe.trial.renderer, renderer);
    assert.equal(recipe.trial.postProcessing.tones.mids, 50);
    assert.equal(recipe.reference.postProcessing, undefined);
    assert.equal(h.renders.length, renders);
    await h.fire("test-tones-reset", "click");
  }
});

test("reset tones restores the original pixels and JPEG while preserving blend and orientation", async () => {
  const h = harness();
  await h.pair();
  h.elements.get("test-balance").value = "35";
  h.elements.get("test-contrast").value = "18";
  h.elements.get("test-base-exposure").value = "-0.5";
  h.elements.get("test-participant-exposure").value = "0.5";
  await h.fire("test-base-exposure");
  await h.fire("test-rotate", "click");
  const before = await h.recipe(), neutral = h.pixels();
  await h.fire("test-download", "click");
  const neutralBlob = h.urls.get(h.downloads.at(-1).href);
  h.elements.get("test-shadows").value = "70";
  await h.fire("test-shadows");
  const rendersBeforeReset = h.renders.length;
  await h.fire("test-tones-reset", "click");
  const after = await h.recipe();
  assert.deepEqual(after.trial.settings, before.trial.settings);
  assert.equal(after.trial.rotationDegrees, 90);
  assert.deepEqual(h.pixels(), neutral);
  assert.equal(h.renders.length, rendersBeforeReset);
  await h.fire("test-download", "click");
  assert.equal(h.urls.get(h.downloads.at(-1).href), neutralBlob, "neutral export should reuse the original JPEG bytes");
  for (const key of ["shadows", "highlights", "mids", "whites", "blacks"]) assert.equal(h.elements.get(`test-${key}-value`).textContent, "0");
});

test("debounced tone exports ignore stale JPEG callbacks and keep downloads aligned with visible pixels", async () => {
  const h = harness();
  await h.pair();
  h.holdEncoding();
  h.elements.get("test-mids").value = "20";
  const first = h.fire("test-mids");
  const firstEncoding = h.encodings.length - 1;
  h.elements.get("test-mids").value = "80";
  await h.fire("test-mids", "input");
  assert.equal(h.elements.get("test-mids").disabled, false);
  assert.equal(h.elements.get("test-download").disabled, true);
  const visible = h.pixels();
  await h.flushTimers();
  const latestEncoding = h.encodings.length - 1;
  assert.ok(latestEncoding > firstEncoding);
  h.releaseEncoding(latestEncoding);
  await h.settle();
  const latest = await h.recipe();
  assert.equal(latest.trial.settings.tones.mids, 80);
  assert.equal(latest.trial.postProcessing.tones.mids, 80);
  await h.fire("test-download", "click");
  const latestUrl = h.downloads.at(-1).href;
  assert.deepEqual(JSON.parse(await h.urls.get(latestUrl).text()).pixels, visible);
  h.releaseEncoding(firstEncoding);
  await first;
  const afterStale = await h.recipe();
  assert.deepEqual(afterStale.trial, latest.trial);
  await h.fire("test-download", "click");
  assert.equal(h.downloads.at(-1).href, latestUrl);
  assert.equal(h.renders.length, 2);
});

test("replacing a photo invalidates a pending tone export and the previous neutral cache", async () => {
  const h = harness();
  await h.pair();
  h.holdEncoding();
  h.elements.get("test-mids").value = "40";
  const oldExport = h.fire("test-mids");
  const oldEncoding = h.encodings.length - 1;
  h.holdEncoding(false);
  await h.select("test-participant", "replacement.jpg");
  const replacement = await h.recipe();
  assert.equal(replacement.sources.participant.name, "replacement.jpg");
  const pixels = h.pixels();
  h.releaseEncoding(oldEncoding);
  await oldExport;
  assert.deepEqual((await h.recipe()).trial, replacement.trial);
  assert.equal((await h.recipe()).sources.participant.name, "replacement.jpg");
  assert.deepEqual(h.pixels(), pixels);
});

test("leaving during a tone export cannot restore a stale preview or download", async () => {
  const h = harness();
  await h.pair();
  h.holdEncoding();
  h.elements.get("test-mids").value = "40";
  const pending = h.fire("test-mids");
  const encoding = h.encodings.length - 1;
  h.pageListeners.get("pagehide")({ persisted: false });
  const revoked = h.revoked.length;
  h.releaseEncoding(encoding);
  await pending;
  assert.equal(h.elements.get("test-canvas").hidden, true);
  assert.equal(h.elements.get("test-download").hidden, true);
  assert.equal(h.elements.get("test-settings-download").hidden, true);
  assert.equal(h.revoked.length, revoked);
});

test("rotating adjusted output rebuilds the neutral cache before subsequent live tone edits", async () => {
  const h = harness();
  await h.pair();
  h.elements.get("test-mids").value = "60";
  await h.fire("test-mids");
  await h.fire("test-rotate", "click");
  const adjusted = h.pixels();
  assert.equal((await h.recipe()).trial.rotationDegrees, 90);
  h.elements.get("test-mids").value = "60";
  await h.fire("test-mids", "input");
  assert.deepEqual(h.pixels(), adjusted, "rotation must not bake existing tones into the new neutral cache");
  await h.fire("test-tones-reset", "click");
  assert.notDeepEqual(h.pixels(), adjusted);
  assert.equal((await h.recipe()).trial.rotationDegrees, 90);
  assert.equal(h.renders.length, 2);
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


test("rotation updates the trial preview, download and recipe without recomposing the photographs", async () => {
  const h = harness();
  assert.equal(h.elements.get("test-rotate").hidden, true);
  await h.fire("test-rotate", "click");
  assert.equal(h.rotations.length, 0);
  await h.pair();
  assert.equal(h.elements.get("test-rotate").hidden, false);
  const before = await h.recipe();
  await h.fire("test-download", "click");
  const oldDownload = h.downloads.at(-1).href;
  await h.fire("test-rotate", "click");
  assert.equal(h.renders.length, 2, "rotation must not recompute either exposure");
  assert.equal(h.rotations.length, 1);
  assert.notEqual(h.rotations[0].canvas, h.elements.get("test-canvas"), "rotation should prepare offscreen before committing the preview");
  const after = await h.recipe();
  assert.equal(after.trial.rotationDegrees, 90);
  assert.equal(after.trial.width, 4);
  assert.equal(after.trial.height, 6);
  assert.deepEqual(after.trial.settings, before.trial.settings);
  assert.deepEqual(after.reference, before.reference);
  await h.fire("test-download", "click");
  assert.notEqual(h.downloads.at(-1).href, oldDownload);
  assert.ok(h.revoked.includes(oldDownload));
  for (let turn = 0; turn < 3; turn++) await h.fire("test-rotate", "click");
  const restored = await h.recipe();
  assert.equal(restored.trial.rotationDegrees, 0);
  assert.equal(restored.trial.width, 6);
  assert.equal(restored.trial.height, 4);
  assert.equal(h.renders.length, 2);
});

test("rotation persists through finishing edits and reset tones, but resets for new photos and reset trial", async () => {
  const h = harness();
  await h.pair();
  await h.fire("test-rotate", "click");
  h.elements.get("test-shadows").value = "20";
  await h.fire("test-shadows");
  assert.equal((await h.recipe()).trial.rotationDegrees, 90);
  assert.equal(h.rotations.at(-1).quarterTurns, 1);
  h.elements.get("test-base-exposure").value = "-0.5";
  await h.fire("test-base-exposure");
  assert.equal((await h.recipe()).trial.rotationDegrees, 90);
  h.elements.get("test-monochrome").checked = false;
  await h.fire("test-monochrome");
  assert.equal((await h.recipe()).trial.rotationDegrees, 90);
  h.elements.get("test-renderer").value = "linear";
  await h.fire("test-renderer");
  assert.equal((await h.recipe()).trial.rotationDegrees, 90);
  await h.fire("test-tones-reset", "click");
  assert.equal((await h.recipe()).trial.rotationDegrees, 90);
  await h.fire("test-reset", "click");
  assert.equal((await h.recipe()).trial.rotationDegrees, 0);
  await h.fire("test-rotate", "click");
  await h.select("test-participant", "replacement.jpg");
  assert.equal((await h.recipe()).trial.rotationDegrees, 0);
});

test("rotation disables controls while pending and keeps the previous result after an error", async () => {
  const h = harness();
  await h.pair();
  const before = await h.recipe();
  let resume;
  h.blockRotation(new Promise((resolve) => { resume = resolve; }));
  const pending = h.fire("test-rotate", "click");
  assert.equal(h.elements.get("test-rotate").disabled, true);
  assert.equal(h.elements.get("test-shadows").disabled, true);
  assert.equal(h.elements.get("test-download").disabled, true);
  resume(); await pending;
  assert.equal(h.elements.get("test-rotate").disabled, false);
  const rotated = await h.recipe();
  h.failRotation(new Error("Rotation failed."));
  await h.fire("test-rotate", "click");
  assert.equal(h.elements.get("test-canvas").hidden, false);
  assert.equal(h.elements.get("test-download").disabled, false);
  const failed = await h.recipe();
  assert.deepEqual(failed.trial, rotated.trial);
  assert.deepEqual(failed.reference, before.reference);
  assert.match(h.elements.get("test-error").textContent, /Rotation failed/);
});
