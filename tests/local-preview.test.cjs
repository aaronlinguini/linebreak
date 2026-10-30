"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const sharedSource = fs.readFileSync(path.join(root, "scripts.js"), "utf8");
const localSource = fs.readFileSync(path.join(root, "local-test.js"), "utf8");

function processorHarness(imageSize = { width: 4, height: 6 }, processorOptions = {}) {
  const canvases = [];
  const decoded = [];
  function canvas() {
    const element = { width: 1, height: 1, draws: [], operations: [], fills: [], written: null };
    let current;
    const context = {
      drawImage(source, ...coordinates) {
        current = source;
        element.draws.push({ source, coordinates });
      },
      fillRect(...coordinates) { element.fills.push(coordinates); },
      save() { element.operations.push(["save"]); },
      restore() { element.operations.push(["restore"]); },
      translate(...coordinates) { element.operations.push(["translate", ...coordinates]); },
      rotate(angle) { element.operations.push(["rotate", angle]); },
      clearRect() { current = null; },
      getImageData(x, y, width, height) {
        const data = new Uint8ClampedArray(width * height * 4);
        if (current.pixels) data.set(current.pixels);
        else for (let index = 0; index < data.length; index += 4) data.set(current.colour, index);
        return { data, width, height };
      },
      putImageData(pixels) { element.written = pixels; }
    };
    element.getContext = () => context;
    element.toBlob = (callback, type, quality) => {
      element.encoding = { type, quality };
      callback({ type, pixels: element.written?.data, width: element.width, height: element.height });
    };
    element.toDataURL = () => "data:image/jpeg;base64,test";
    canvases.push(element);
    return element;
  }
  const document = {
    getElementById() { return null; },
    createElement(tag) { assert.equal(tag, "canvas"); return canvas(); }
  };
  const sandbox = vm.createContext({
    document, setTimeout,
    URL: { createObjectURL() { return "blob:test-photo"; }, revokeObjectURL() {} },
    Image: class {
      constructor() { this.naturalWidth = imageSize.width; this.naturalHeight = imageSize.height; }
      async decode() {}
    },
    ImageData: class {
      constructor(width, height) {
        this.width = width;
        this.height = height;
        this.data = new Uint8ClampedArray(width * height * 4);
      }
    },
    async createImageBitmap(blob) {
      const bitmap = { ...blob, closed: false, close() { this.closed = true; } };
      decoded.push(bitmap);
      return bitmap;
    }
  });
  // No GoogleDriveStorage, archive workflow, or endpoint config is supplied.
  vm.runInContext(sharedSource, sandbox);
  const processor = sandbox.createExposureProcessor(processorOptions);
  return { processor, canvas, canvases, decoded };
}

test("the shared processor loads on a non-archive page without a Google connection", () => {
  const { processor } = processorHarness();
  assert.equal(typeof processor.loadPhoto, "function");
  assert.equal(typeof processor.releasePhoto, "function");
  assert.equal(typeof processor.develop, "function");
});

test("an experimental mixer can use the shared preparation path without changing the default renderer", async () => {
  let receivedSettings;
  const settings = { baseExposure: -1, participantExposure: -0.5, monochrome: true };
  const { processor, canvas } = processorHarness(undefined, {
    mixerFactory(actualSettings) {
      receivedSettings = actualSettings;
      return (base, participant, output, start, end) => {
        for (let index = start; index < end; index += 4) output.set([40,40,40,255], index);
      };
    }
  });
  const photo = { width: 1, height: 1, blob: { colour: [128,128,128,255] } };
  const output = canvas();
  await processor.develop(photo, photo, output, settings);
  assert.equal(receivedSettings, settings);
  assert.deepEqual(Array.from(output.written.data), [40,40,40,255]);
});

test("the shared browser develop path uses the actual two-way light treatment and JPEG settings", async () => {
  const { processor, canvas, canvases, decoded } = processorHarness();
  const pixels = (colours) => colours.flatMap((colour) => [...colour, 255]);
  const base = { width: 6, height: 1, blob: { pixels: pixels([[255,255,255],[255,0,0],[0,0,0],[0,0,255],[128,128,128],[0,0,0]]) } };
  const second = { width: 6, height: 1, blob: { pixels: pixels([[255,0,0],[255,255,255],[0,0,255],[0,0,0],[128,128,128],[0,0,0]]) } };
  const output = canvas();
  const result = await processor.develop(base, second, output);
  assert.deepEqual(Array.from(output.written.data), pixels([[255,255,255],[255,255,255],[0,0,255],[0,0,255],[176,176,176],[0,0,0]]));
  assert.equal(result.width, 6);
  assert.equal(result.height, 1);
  assert.equal(result.blob.pixels, output.written.data);
  assert.deepEqual(output.encoding, { type: "image/jpeg", quality: 0.95 });
  assert.ok(decoded.every((bitmap) => bitmap.closed), "both decoded images should be released");
  assert.equal(canvases[1].width, 1, "scratch canvas should release its backing pixels");
  assert.equal(canvases[1].height, 1);
});

test("local and archive processing preserve the full smaller photograph without enlargement", async () => {
  const { processor, canvas, canvases, decoded } = processorHarness();
  const output = canvas();
  const result = await processor.develop(
    { width: 400, height: 200, blob: { colour: [0,0,0,255] } },
    { width: 150, height: 100, blob: { colour: [80,100,120,255] } },
    output
  );
  assert.equal(result.width, 200);
  assert.equal(result.height, 100);
  const scratch = canvases[1];
  assert.deepEqual(scratch.draws[0].coordinates, [0,0,200,100]);
  assert.deepEqual(scratch.draws[1].coordinates, [25,0,150,100]);
  assert.deepEqual(scratch.fills, [[0,0,200,100], [0,0,200,100]]);
  assert.deepEqual(Array.from(output.written.data.slice(0,4)), [80,100,120,255]);
  assert.ok(decoded.every((bitmap) => bitmap.closed));
});

test("portrait preparation rotates the full frame clockwise before making working copies", async () => {
  const { processor, canvases } = processorHarness({ width: 4, height: 6 });
  const photo = await processor.loadPhoto({ name: "portrait.jpg", type: "image/jpeg", size: 100 });
  assert.equal(photo.width, 6);
  assert.equal(photo.height, 4);
  assert.equal(photo.originalWidth, 4);
  assert.equal(photo.originalHeight, 6);
  assert.deepEqual(canvases[0].operations, [["save"], ["translate",6,0], ["rotate",Math.PI/2], ["restore"]]);
  assert.deepEqual(canvases[0].draws[0].coordinates, [0,0,4,6]);
  assert.equal(photo.blob.width, 6);
  assert.equal(photo.blob.height, 4);
});

test("landscape and square preparation retain their orientation", async () => {
  for (const size of [{ width: 6, height: 4 }, { width: 4, height: 4 }]) {
    const { processor, canvases } = processorHarness(size);
    const photo = await processor.loadPhoto({ name: "photo.jpg", type: "image/jpeg", size: 100 });
    assert.equal(photo.width, size.width);
    assert.equal(photo.height, size.height);
    assert.deepEqual(canvases[0].operations, []);
  }
});

test("local photo validation rejects unsupported or oversized files before decoding", async () => {
  const { processor, decoded } = processorHarness();
  await assert.rejects(processor.loadPhoto({ name: "raw.nef", type: "application/octet-stream", size: 100 }), /not a supported photo/);
  await assert.rejects(processor.loadPhoto({ name: "large.jpg", type: "image/jpeg", size: 30 * 1024 * 1024 + 1 }), /larger than 30 MB/);
  assert.equal(decoded.length, 0);
});

test("the local test page keeps CSS and JavaScript external and loads no archive dependencies", () => {
  const html = fs.readFileSync(path.join(root, "local-test.html"), "utf8");
  assert.doesNotMatch(html, /<style\b|\sstyle\s*=|\son[a-z]+\s*=|javascript\s*:/i);
  assert.match(html, /<link\b[^>]*href="styles\.css"/);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  const references = scripts.map(([, attributes, body]) => {
    assert.equal(body.trim(), "");
    const reference = attributes.match(/\bsrc="([^"]+)"/);
    assert.ok(reference);
    assert.ok(fs.existsSync(path.join(root, reference[1].split("?")[0])));
    return reference[1];
  });
  assert.deepEqual(references, ["project-config.js", "scripts.js?v=result-rotation-v1", "film-renderer.js?v=smooth-revised-v1", "tone-adjustments.js?v=tone-curve-v1", "local-test.js?v=visible-tones-rotation-v1"]);
  assert.match(html, /<link\b[^>]*href="local-test\.css"/);
  const publicHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.doesNotMatch(publicHtml, /film-renderer\.js|local-test\.js|test-base-exposure/);
  assert.match(html, /Nothing is uploaded or automatically saved/);
  assert.match(html, /<button\b[^>]*id="test-rotate"[^>]*>Rotate 90°<\/button>/);
});

test("the overlap control names its effect and explains both endpoints accessibly", () => {
  const html = fs.readFileSync(path.join(root, "local-test.html"), "utf8");
  assert.match(html, /<option\b[^>]*value="balanced"[^>]*selected>Reduced overlap \(trial\)<\/option>/);
  assert.match(html, /<label\b[^>]*for="test-balance">Haze reduction /);
  assert.match(html, /<input\b[^>]*id="test-balance"[^>]*aria-describedby="test-balance-help"/);
  assert.match(html, /<p\b[^>]*id="test-balance-help"[^>]*>0%: saved addition\. Higher: less overlapping light in shadows, midtones and highlights; black still reveals the other photo\.<\/p>/);
});

test("tone sliders remain visible, labelled, neutral and excluded from the public page", () => {
  const html = fs.readFileSync(path.join(root, "local-test.html"), "utf8");
  assert.doesNotMatch(html, /<details\b[^>]*id="test-tone-panel"/);
  assert.match(html, /<section\b[^>]*id="test-tone-panel"[^>]*aria-labelledby="test-tone-title"/);
  assert.match(html, /<h2\b[^>]*id="test-tone-title"[^>]*>Tone adjustments<\/h2>/);
  for (const name of ["shadows", "highlights", "mids", "whites", "blacks"]) {
    const input = html.match(new RegExp(`<input\\b[^>]*id="test-${name}"[^>]*>`))[0];
    assert.match(input, /min="-100"/);
    assert.match(input, /max="100"/);
    assert.match(input, /value="0"/);
    assert.match(input, /aria-describedby="test-tone-help"/);
    assert.match(html, new RegExp(`<label\\b[^>]*for="test-${name}"`));
  }
  assert.match(html, /<button\b[^>]*id="test-tones-reset"[^>]*>Reset tones<\/button>/);
  const publicHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.doesNotMatch(publicHtml, /tone-adjustments|test-tone-panel|test-shadows/);
});

test("a failed local selection clears the previous result, reports the error, and allows another try", async () => {
  const listeners = new Map();
  const elements = new Map();
  const html = fs.readFileSync(path.join(root, "local-test.html"), "utf8");
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) {
    elements.set(id, {
      hidden: true, disabled: false, value: "", textContent: "", files: [],
      addEventListener(type, handler) { listeners.set(`${id}:${type}`, handler); },
      setAttribute() {}
    });
  }
  elements.get("test-renderer").value = "film";
  elements.get("test-base-exposure").value = "-1";
  elements.get("test-participant-exposure").value = "-1";
  elements.get("test-contrast").value = "12";
  elements.get("test-balance").value = "100";
  const revoked = [];
  const released = [];
  let developments = 0;
  const sandbox = vm.createContext({
    Error, Blob, Date,
    document: { getElementById(id) { return elements.get(id); } },
    window: { addEventListener() {} },
    URL: { createObjectURL() { return "blob:local-result"; }, revokeObjectURL(url) { revoked.push(url); } },
    PROJECT_SETTINGS: { baseExposure: 0, participantExposure: 0, contrast: 0, monochrome: false },
    ExposureMath: { balancedVersion: "overlap-suppression-v2", balancedParameters: {} },
    FilmExposureMath: { version: "assumed-film-v1" },
    ToneAdjustments: { version: "tone-curve-v1", createMapper() { return null; } },
    createExposureProcessor() {
      return {
        async loadPhoto(file) {
          if (file.invalid) throw new Error("Unsupported photograph.");
          return { name: file.name };
        },
        releasePhoto(photo) { if (photo) released.push(photo); },
        async develop() { developments++; return { blob: {} }; }
      };
    }
  });
  vm.runInContext(localSource, sandbox);
  const select = async (id, file) => {
    elements.get(id).files = [file];
    await listeners.get(`${id}:change`)();
  };
  await select("test-base", { name: "base.jpg" });
  assert.equal(developments, 0);
  await select("test-participant", { name: "second.jpg" });
  assert.equal(developments, 2);
  assert.equal(elements.get("test-canvas").hidden, false);
  assert.equal(elements.get("test-download").disabled, false);
  assert.match(elements.get("test-status").textContent, /^Ready\./);
  await select("test-base", { name: "bad.raw", invalid: true });
  assert.deepEqual(revoked, ["blob:local-result", "blob:local-result", "blob:local-result"]);
  assert.equal(elements.get("test-canvas").hidden, true);
  assert.equal(elements.get("test-download").disabled, true);
  assert.equal(elements.get("test-error").textContent, "Unsupported photograph.");
  assert.equal(elements.get("test-error").hidden, false);
  assert.equal(elements.get("test-base").disabled, false);
  assert.equal(elements.get("test-participant").disabled, false);
  assert.equal(elements.get("test-base").value, "");
  await select("test-base", { name: "replacement.jpg" });
  assert.equal(developments, 4);
  assert.equal(elements.get("test-error").hidden, true);
  assert.equal(elements.get("test-canvas").hidden, false);
  assert.equal(released.length, 1);
});
