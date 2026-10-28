"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts.js"), "utf8");
const sandbox = vm.createContext({});
vm.runInContext(`${source}\nglobalThis.testExposureMath = ExposureMath; globalThis.testProjectSettings = PROJECT_SETTINGS;`, sandbox, { timeout: 1000 });
const math = sandbox.testExposureMath;
const projectSettings = sandbox.testProjectSettings;

function close(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
}

function mix(base, participant, overrides = {}, Output = Uint8ClampedArray) {
  const output = new Output(base.length);
  math.createMixer({
    baseExposure: -1, participantExposure: -1, contrast: 0, monochrome: false, ...overrides
  })(base, participant, output);
  return Array.from(output);
}

// Independent neutral reference: add the two decoded light contributions,
// clip at display white, then encode back to sRGB.
const referenceDecode = (byte) => {
  const value = byte / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const referenceEncode = (linear) => Math.round(255 * (linear <= 0.0031308
  ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055));
function referenceNeutral(first, second) {
  const a = referenceDecode(first), b = referenceDecode(second);
  return referenceEncode(Math.min(1, a + b));
}

test("the math module loads without a document or browser", () => {
  assert.equal(typeof sandbox.document, "undefined");
  assert.equal(typeof math.createMixer, "function");
  assert.ok(Object.isFrozen(math));
});

test("sRGB transfer matches reference values and round trips", () => {
  close(math.srgbToLinear(0), 0);
  close(math.srgbToLinear(1), 1);
  close(math.srgbToLinear(0.5), 0.21404114048223255);
  close(math.srgbToLinear(0.04045), 0.0031308049535603713);
  close(math.linearToSrgb(0.5), 0.7353569830524495);
  close(math.linearToSrgb(0.0031308), 0.040449936);
  for (const value of [0, 0.01, 0.04045, 0.18, 0.5, 0.8, 1]) {
    close(math.linearToSrgb(math.srgbToLinear(value)), value, 1e-7);
  }
});

test("black contributes no light and the result is opaque", () => {
  assert.deepEqual(mix([0, 0, 0, 0], [0, 0, 0, 0]), [0, 0, 0, 255]);
  assert.deepEqual(
    mix([0, 0, 0, 255], [128, 96, 64, 255], { baseExposure: 0, participantExposure: 0 }),
    [128, 96, 64, 255]
  );
});

test("one stop halves linear light rather than rendered display bytes", () => {
  assert.deepEqual(mix([0, 0, 0, 255], [128, 128, 128, 255]), [92, 92, 92, 255]);
});

test("identical photographs retain every channel value at minus one stop each", () => {
  const ramp = Array.from({ length: 256 }, (_, value) => [value, 255 - value, (value * 73) % 256, 255]).flat();
  assert.deepEqual(mix(ramp, ramp), ramp);
});

test("one stop of compensation lowers white to the encoded half-light level", () => {
  assert.deepEqual(mix([0, 0, 0, 255], [255, 255, 255, 255]), [188, 188, 188, 255]);
  assert.deepEqual(mix([255, 255, 255, 255], [0, 0, 0, 255]), [188, 188, 188, 255]);
});

const first = [0, 20, 255, 255, 64, 180, 90, 255, 255, 255, 255, 255, 110, 8, 200, 255];
const second = [200, 90, 5, 255, 128, 32, 220, 255, 255, 180, 60, 255, 80, 240, 0, 255];

test("equal exposure settings make image order irrelevant", () => {
  assert.deepEqual(mix(first, second), mix(second, first));
});

test("swapping images together with their exposure settings preserves the result", () => {
  assert.deepEqual(
    mix(first, second, { baseExposure: -2.3, participantExposure: 0.7, contrast: 18 }),
    mix(second, first, { baseExposure: 0.7, participantExposure: -2.3, contrast: 18 })
  );
});

test("increasing a neutral input never decreases the output", () => {
  const ramp = Array.from({ length: 256 }, (_, value) => [value, value, value, 255]).flat();
  const dark = Array.from({ length: 256 }, () => [0, 0, 0, 255]).flat();
  const output = mix(ramp, dark, { baseExposure: 1, participantExposure: 0 });
  for (let index = 4; index < output.length; index += 4) assert.ok(output[index] >= output[index - 4]);
  assert.ok(output[output.length - 4] > output[128 * 4]);
});

test("the project uses neutral uncompensated exposure as its reference treatment", () => {
  assert.deepEqual({ ...projectSettings }, { baseExposure: 0, participantExposure: 0, contrast: 0, monochrome: false });
  assert.equal("shoulder" in math, false, "a shared RGB shoulder would dim unaffected highlight channels");
});

test("a white base stays white for RGB endpoints, full channel ramps, and varied colours", () => {
  const colours = [];
  for (const red of [0, 255]) for (const green of [0, 255]) for (const blue of [0, 255]) colours.push([red, green, blue]);
  for (let value = 0; value < 256; value++) {
    colours.push([value, value, value], [value, 0, 0], [0, value, 0], [0, 0, value]);
  }
  // Deterministic cross-channel samples supplement the complete per-channel
  // ranges without making every test run scan the entire 16-million RGB cube.
  let seed = 0x7a1e3b29;
  for (let index = 0; index < 1000; index++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    colours.push([seed >>> 24, (seed >>> 12) & 255, seed & 255]);
  }
  const participant = colours.flatMap((colour) => [...colour, 255]);
  const base = new Uint8ClampedArray(participant.length).fill(255);
  assert.ok(mix(base, participant, projectSettings).every((value) => value === 255));
});

test("a black base reveals all participant byte values without altering them at neutral exposure", () => {
  const participant = Array.from({ length: 256 }, (_, value) => [value, 255 - value, (value * 73) % 256, 255]).flat();
  const black = new Uint8ClampedArray(participant.length);
  for (let index = 3; index < black.length; index += 4) black[index] = 255;
  assert.deepEqual(mix(black, participant, projectSettings), participant);
  assert.deepEqual(mix(participant, black, projectSettings), participant);
  assert.deepEqual(mix([0, 0, 0, 255], [255, 0, 0, 255], projectSettings), [255, 0, 0, 255]);
});

test("near-white regions retain their tone and have limited headroom for an added exposure", () => {
  const nearWhite = [250, 250, 250, 255];
  assert.deepEqual(mix(nearWhite, [0, 0, 0, 255], projectSettings), nearWhite);
  assert.deepEqual(mix(nearWhite, [255, 0, 0, 255], projectSettings), [255, 250, 250, 255]);
  assert.deepEqual(mix(nearWhite, [0, 0, 255, 255], projectSettings), [250, 250, 255, 255]);
  assert.deepEqual(mix(nearWhite, [255, 255, 255, 255], projectSettings), [255, 255, 255, 255]);
});

test("adding light to one channel never darkens another channel", () => {
  const participant = Array.from({ length: 256 }, (_, red) => [red, 50, 90, 255]).flat();
  const base = Array.from({ length: 256 }, () => [245, 160, 90, 255]).flat();
  const output = mix(base, participant, projectSettings);
  for (let index = 4; index < output.length; index += 4) {
    assert.ok(output[index] >= output[index - 4]);
    assert.equal(output[index + 1], output[1], "red light must not change green");
    assert.equal(output[index + 2], output[2], "red light must not change blue");
  }
});

test("neutral midtones add in linear light and clip at white", () => {
  const pairs = [[128, 128], [200, 128], [200, 192], [224, 128], [240, 64], [240, 128], [240, 192], [250, 192], [254, 254]];
  const expected = [176, 230, 255, 251, 246, 255, 255, 255, 255];
  const base = pairs.flatMap(([value]) => [value, value, value, 255]);
  const participant = pairs.flatMap(([, value]) => [value, value, value, 255]);
  assert.deepEqual(pairs.map(([a, b]) => referenceNeutral(a, b)), expected);
  assert.deepEqual(mix(base, participant, projectSettings), expected.flatMap((value) => [value, value, value, 255]));
});

test("contrast preserves black and white and changes tones in the expected direction", () => {
  for (const amount of [-30, 0, 30]) {
    close(math.contrastCurve(0, amount), 0);
    close(math.contrastCurve(1, amount), 1);
    close(math.contrastCurve(0.5, amount), 0.5);
    close(math.contrastCurve(0.25, amount) + math.contrastCurve(0.75, amount), 1);
  }
  assert.ok(math.contrastCurve(0.25, 30) < 0.25);
  assert.ok(math.contrastCurve(0.75, 30) > 0.75);
  assert.ok(math.contrastCurve(0.25, -30) > 0.25);
});

test("supported exposure and contrast settings always produce finite bounded pixels", () => {
  // Float output exposes undefined/NaN lookup results that a byte array could hide.
  const colors = [...first, 0, 0, 0, 255, 255, 255, 255, 255];
  const partners = [...second, 255, 255, 255, 255, 0, 0, 0, 255];
  for (let step = 0; step <= 40; step++) {
    for (const contrast of [-30, 0, 30]) {
      const output = mix(colors, partners, {
        baseExposure: -3 + step / 10,
        participantExposure: 1 - step / 10,
        contrast
      }, Float64Array);
      assert.ok(output.every((value) => Number.isFinite(value) && value >= 0 && value <= 255));
      for (let index = 3; index < output.length; index += 4) assert.equal(output[index], 255);
    }
  }
});

test("monochrome uses light-weighted luminance and gives equal output channels", () => {
  const primaries = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255];
  const output = mix(primaries, new Array(12).fill(0), {
    baseExposure: 0, participantExposure: 0, monochrome: true
  });
  // Standard linear-sRGB luminance weights encode to approximately these bytes.
  assert.deepEqual(output, [127, 127, 127, 255, 220, 220, 220, 255, 76, 76, 76, 255]);
  assert.deepEqual(mix(new Array(12).fill(0), primaries, {
    baseExposure: 0, participantExposure: 0, monochrome: true
  }), output);
  assert.deepEqual(mix(primaries, primaries, { monochrome: true }), output);
});

test("processing a pixel chunk leaves pixels outside its range untouched", () => {
  const output = new Float64Array(first.length).fill(-7);
  const mixer = math.createMixer({ baseExposure: -1, participantExposure: -1, contrast: 0, monochrome: false });
  mixer(first, second, output, 4, 12);
  assert.deepEqual(Array.from(output.slice(0, 4)), [-7, -7, -7, -7]);
  assert.deepEqual(Array.from(output.slice(12)), [-7, -7, -7, -7]);
  assert.deepEqual(Array.from(output.slice(4, 12)), mix(first, second).slice(4, 12));
});

test("cover cropping is centered for square, wide, and tall output frames", () => {
  assert.deepEqual({ ...math.coverCrop(4000, 3000, 1000, 1000) }, { x: 500, y: 0, width: 3000, height: 3000 });
  assert.deepEqual({ ...math.coverCrop(3000, 4000, 1600, 900) }, { x: 0, y: 1156.25, width: 3000, height: 1687.5 });
  assert.deepEqual({ ...math.coverCrop(4000, 1000, 1000, 2000) }, { x: 1750, y: 0, width: 500, height: 1000 });
});

test("output dimensions respect the edge limit without enlarging small photographs", () => {
  assert.deepEqual({ ...math.outputSize(6000, 4000, 2400) }, { width: 2400, height: 1600 });
  assert.deepEqual({ ...math.outputSize(800, 600, 2400) }, { width: 800, height: 600 });
  for (const [width, height] of [[1, 1], [1, 8000], [12000, 8000], [900, 1800], [4000, 3000], [3, 2]]) {
    for (const maxEdge of [1200, 2400]) {
      const output = math.outputSize(width, height, maxEdge);
      assert.ok(output.width >= 1 && output.height >= 1);
      assert.ok(output.width <= width && output.height <= height);
      assert.ok(Math.max(output.width, output.height) <= maxEdge);
      const scale = Math.min(1, maxEdge / Math.max(width, height));
      // Extremely thin photographs still need a one-pixel canvas dimension.
      close(output.width, width * scale, 1);
      close(output.height, height * scale, 1);
    }
  }
});

test("ordered pairing follows collection order and wraps at its end", () => {
  const selected = Array.from({ length: 7 }, (_, next) => math.selectIndex(3, "sequence", -1, next, 0.9));
  assert.deepEqual(selected, [0, 1, 2, 0, 1, 2, 0]);
});

test("random pairing can select every alternative without repeating the current photograph", () => {
  for (const length of [2, 3, 8, 24]) {
    for (let current = 0; current < length; current++) {
      const selected = new Set();
      for (let bucket = 0; bucket < length - 1; bucket++) {
        const choice = math.selectIndex(length, "random", current, 0, (bucket + 0.5) / (length - 1));
        assert.ok(choice >= 0 && choice < length);
        assert.notEqual(choice, current);
        selected.add(choice);
      }
      assert.equal(selected.size, length - 1);
      for (const boundary of [0, 1]) assert.notEqual(math.selectIndex(length, "random", current, 0, boundary), current);
    }
  }
});

test("empty and single-image collections have defined pairing behavior", () => {
  for (const mode of ["sequence", "random"]) {
    assert.equal(math.selectIndex(0, mode, -1, 0, 0), -1);
    assert.equal(math.selectIndex(1, mode, 0, 0, 0.9), 0);
  }
  assert.equal(math.selectIndex(4, "random", -1, 0, 0), 0);
  assert.equal(math.selectIndex(4, "random", -1, 0, 1), 3);
});

test("HTML keeps styling and executable code in their separate files", () => {
  for (const file of ["index.html", "google-apps-script/Bridge.html"]) {
    const filename = path.join(root, file);
    if (!fs.existsSync(filename)) continue;
    const html = fs.readFileSync(filename, "utf8");
    assert.doesNotMatch(html, /<style\b/i, file);
    assert.doesNotMatch(html, /\sstyle\s*=/i, file);
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, file);
    assert.doesNotMatch(html, /javascript\s*:/i, file);
    if (file === "index.html") {
      assert.match(html, /<link\b[^>]*href=["']styles\.css["'][^>]*>/i);
      assert.match(html, /<script\b[^>]*src=["']scripts\.js["']/i);
    }
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
    assert.ok(scripts.length >= 1, file);
    for (const [, attributes, body] of scripts) {
      const reference = attributes.match(/\bsrc=["']([^"']+)["']/i);
      assert.ok(reference, `${file} must use an external script`);
      assert.equal(body.trim(), "", `${file} must not contain JavaScript bodies`);
      if (file === "index.html") {
        assert.match(reference[1], /^[A-Za-z0-9._/-]+\.js$/);
        assert.ok(fs.existsSync(path.join(root, reference[1])), `missing external script ${reference[1]}`);
      } else {
        assert.equal(reference[1], "__BRIDGE_SCRIPT_URL__");
      }
    }
  }
});
