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

test("the artist's black-and-white option controls the actual shared mixer settings", () => {
  for (const forceBlackAndWhite of [false, true]) {
    const configured = vm.createContext({ EXPOSURE_CONFIG: { forceBlackAndWhite } });
    vm.runInContext(`${source}\nglobalThis.math = ExposureMath; globalThis.settings = PROJECT_SETTINGS;`, configured);
    const output = new Uint8ClampedArray(4);
    configured.math.createMixer(configured.settings)([255, 0, 0, 255], [0, 0, 0, 255], output);
    assert.equal(configured.settings.monochrome, forceBlackAndWhite);
    assert.deepEqual(Array.from(output), forceBlackAndWhite ? [127, 127, 127, 255] : [255, 0, 0, 255]);
  }
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

test("the public project uses the Saved Current treatment with contrast 12", () => {
  assert.deepEqual({ ...projectSettings }, { baseExposure: 0, participantExposure: 0, contrast: 12, monochrome: false });
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
  const neutral = { ...projectSettings, contrast: 0 };
  const participant = Array.from({ length: 256 }, (_, value) => [value, 255 - value, (value * 73) % 256, 255]).flat();
  const black = new Uint8ClampedArray(participant.length);
  for (let index = 3; index < black.length; index += 4) black[index] = 255;
  assert.deepEqual(mix(black, participant, neutral), participant);
  assert.deepEqual(mix(participant, black, neutral), participant);
  assert.deepEqual(mix([0, 0, 0, 255], [255, 0, 0, 255], neutral), [255, 0, 0, 255]);
});

test("near-white regions retain their tone and have limited headroom for an added exposure", () => {
  const neutral = { ...projectSettings, contrast: 0 };
  const nearWhite = [250, 250, 250, 255];
  assert.deepEqual(mix(nearWhite, [0, 0, 0, 255], neutral), nearWhite);
  assert.deepEqual(mix(nearWhite, [255, 0, 0, 255], neutral), [255, 250, 250, 255]);
  assert.deepEqual(mix(nearWhite, [0, 0, 255, 255], neutral), [250, 250, 255, 255]);
  assert.deepEqual(mix(nearWhite, [255, 255, 255, 255], neutral), [255, 255, 255, 255]);
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
  assert.deepEqual(mix(base, participant, { ...projectSettings, contrast: 0 }), expected.flatMap((value) => [value, value, value, 255]));
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

function mixBalanced(base, participant, overrides = {}, Output = Uint8ClampedArray) {
  const output = new Output(base.length);
  math.createBalancedMixer({ baseExposure: 0, participantExposure: 0, contrast: 12, monochrome: false, balanceStrength: 100, ...overrides })(base, participant, output);
  return Array.from(output);
}

test("the saved Current + contrast checkpoint retains its exact pixels", () => {
  // Captured from c1cd211 before the shared encoder was extracted.
  for (const fixture of [
    { settings: { baseExposure: 0, participantExposure: 0, contrast: 12, monochrome: false }, output: [209,87,255,255,144,191,241,255,255,255,255,255,134,246,209,255] },
    { settings: { baseExposure: -0.5, participantExposure: 1, contrast: 24, monochrome: true }, output: [195,195,195,255,198,198,198,255,255,255,255,255,255,255,255,255] },
    { settings: { baseExposure: 1, participantExposure: -1, contrast: 0, monochrome: false }, output: [146,72,255,255,127,246,198,255,255,255,255,255,160,177,255,255] }
  ]) assert.deepEqual(mix(first, second, fixture.settings), fixture.output);
});

test("balance zero reproduces Current + contrast exactly across colours, EV and monochrome", () => {
  assert.equal(math.balancedVersion, "overlap-suppression-v2");
  assert.ok(Object.isFrozen(math.balancedParameters));
  assert.deepEqual({ ...math.balancedParameters }, { maximumPower: 4 });
  const ramp = Array.from({ length: 256 }, (_, value) => [value, 255-value, value*73%256, 255]).flat();
  const other = Array.from({ length: 256 }, (_, value) => [255-value, value*31%256, value, 0]).flat();
  for (const monochrome of [false, true]) {
    for (const [baseExposure, participantExposure, contrast] of [[0,0,12],[-3,2,0],[1,-0.5,30]]) {
      const settings = { baseExposure, participantExposure, contrast, monochrome };
      assert.deepEqual(mixBalanced(ramp, other, { ...settings, balanceStrength: 0 }), mix(ramp, other, settings));
    }
  }
});

test("the monochrome correction preserves the approved colour output exactly", () => {
  // Colour fixtures captured from a7f543e before changing monochrome order.
  for (const fixture of [
    { settings: { baseExposure: 0, participantExposure: 0, contrast: 12, balanceStrength: 100 }, output: [209,84,255,255,128,188,229,255,255,255,255,255,108,246,209,255] },
    { settings: { baseExposure: -0.5, participantExposure: 1, contrast: 24, balanceStrength: 40 }, output: [255,124,236,255,192,164,255,255,255,255,236,255,118,255,186,255] },
    { settings: { baseExposure: 1, participantExposure: -1, contrast: 0, balanceStrength: 75 }, output: [146,64,255,255,101,245,165,255,255,255,255,255,152,176,255,255] }
  ]) assert.deepEqual(mixBalanced(first, second, { ...fixture.settings, monochrome: false }), fixture.output);
});

test("monochrome retains sign detail from the combined colour channels", () => {
  const blueBackground = [80,120,220,255];
  const redSign = [200,0,0,255];
  const darkLettering = [20,20,20,255];
  const sign = mixBalanced(blueBackground, redSign, { monochrome: true });
  const lettering = mixBalanced(blueBackground, darkLettering, { monochrome: true });
  assert.deepEqual(sign, [155,155,155,255]);
  assert.deepEqual(lettering, [124,124,124,255]);
  // a7f543e converted each source to gray first, leaving only 126 - 124 = 2.
  assert.ok(sign[0] - lettering[0] >= 30, "colour channel detail must survive the monochrome conversion");
});

test("already-grayscale photographs keep identical colour and monochrome tones", () => {
  const ramp = Array.from({ length: 256 }, (_, value) => [value,value,value,255]).flat();
  const other = Array.from({ length: 256 }, (_, value) => [255-value,255-value,255-value,255]).flat();
  for (const balanceStrength of [0,40,100]) {
    for (const [baseExposure, participantExposure, contrast] of [[0,0,0],[0,0,12],[-3,2,30],[1,-0.5,12]]) {
      const settings = { balanceStrength, baseExposure, participantExposure, contrast };
      assert.deepEqual(mixBalanced(ramp, other, { ...settings, monochrome: true }), mixBalanced(ramp, other, { ...settings, monochrome: false }));
    }
  }
});

test("overlap suppression removes the shadow boost and reduces overlap throughout the tonal range", () => {
  const pair = (a, b, balanced) => (balanced ? mixBalanced : mix)([a,a,a,255], [b,b,b,255], { baseExposure: 0, participantExposure: 0, contrast: 12, monochrome: true })[0];
  for (const [a,b] of [[40,40],[80,80],[128,128],[185,128],[185,185],[200,200],[220,200]]) {
    assert.ok(pair(a,b,true) < pair(a,b,false), "suppression must be darker than saved addition, including dark overlaps");
    const brighterSource = Math.max(pair(a,0,false), pair(0,b,false));
    assert.ok(pair(a,b,true) >= brighterSource, "additional exposure must not darken the brighter single source at matching contrast");
  }
  assert.equal(pair(0,0,true),0);
  assert.ok(pair(40,40,true)<=40, "two dim inputs should stay dark without an arbitrary shadow boost");
  assert.ok(Math.abs(pair(40,128,true)-pair(0,128,false))<=1, "a dim strip should leave the portrait's tone nearly unchanged");
  const brightSource=pair(235,0,false);
  assert.ok(Math.abs(pair(235,128,true)-brightSource)<Math.abs(pair(235,128,false)-brightSource), "a bright background should retain less midtone contamination");
});

test("balanced output is symmetric when source photos and EV settings are exchanged", () => {
  for (const monochrome of [false,true]) {
    for (const balanceStrength of [0,40,100]) {
      assert.deepEqual(
        mixBalanced(first, second, { baseExposure: -2.3, participantExposure: 0.7, monochrome, balanceStrength }),
        mixBalanced(second, first, { baseExposure: 0.7, participantExposure: -2.3, monochrome, balanceStrength })
      );
    }
  }
});

test("a balanced photograph against black retains the saved single-source exposure response", () => {
  const ramp = Array.from({ length: 256 }, (_, value) => [value, 255-value, value*73%256, 255]).flat();
  const black = new Uint8ClampedArray(ramp.length);
  for (const monochrome of [false,true]) {
    for (const baseExposure of [-3,0,2]) {
      const settings = { baseExposure, participantExposure: 0, contrast: 12, monochrome };
      assert.deepEqual(mixBalanced(ramp, black, settings), mix(ramp, black, settings));
      assert.deepEqual(mixBalanced(black, ramp, { ...settings, baseExposure: 0, participantExposure: baseExposure }), mix(ramp, black, settings));
    }
  }
});

test("every grayscale pair is monotone in input and suppression strength without darkening below a source", () => {
  const base = [], partner = [];
  for (let secondByte=0; secondByte<256; secondByte++) {
    for (let firstByte=0; firstByte<256; firstByte++) {
      base.push(firstByte,firstByte,firstByte,255);
      partner.push(secondByte,secondByte,secondByte,255);
    }
  }
  const black=new Uint8ClampedArray(base.length);
  const floorA=mixBalanced(base,black,{monochrome:true,balanceStrength:0});
  const floorB=mixBalanced(black,partner,{monochrome:true,balanceStrength:0});
  let previous=null;
  for (const balanceStrength of [0,25,50,75,100]) {
    const output = mixBalanced(base, partner, { monochrome: true, balanceStrength }, Float64Array);
    assert.ok(output.every((value) => Number.isFinite(value) && value>=0 && value<=255));
    for(let index=0;index<output.length;index+=4) {
      assert.ok(output[index]>=Math.max(floorA[index],floorB[index]), "suppression must respect the matching single-source floor");
      if(previous) assert.ok(output[index]<=previous[index], "increasing suppression must never brighten an overlap");
      assert.equal(output[index+3],255);
    }
    for (let secondByte=0; secondByte<256; secondByte++) {
      for (let firstByte=1; firstByte<256; firstByte++) {
        const index = (secondByte*256+firstByte)*4;
        const delta = output[index]-output[index-4];
        assert.ok(delta>=0 && delta<=3, `balance ${balanceStrength}, ${secondByte}+${firstByte} must not reverse or jump`);
        assert.equal(output[index+3],255);
      }
    }
    previous=output;
  }
});

test("balanced colour ramps stay continuous and retain the known clipped-channel limit", () => {
  for (const background of [[40,40,40],[185,185,185],[235,235,235],[255,0,0],[0,255,0],[0,0,255]]) {
    for (let channel=0; channel<3; channel++) {
      const base = [], ramp = [];
      for (let byte=0; byte<256; byte++) {
        const rgb = [20,50,80]; rgb[channel]=byte;
        base.push(...background,255); ramp.push(...rgb,255);
      }
      const output = mixBalanced(base,ramp);
      for (let index=4; index<output.length; index+=4) {
        for (let c=0;c<3;c++) assert.ok(Math.abs(output[index+c]-output[index-4+c])<=4, "RGB ramps must not regain the rejected middle-tone jump");
      }
    }
  }
  assert.deepEqual(mixBalanced([255,255,255,255],[255,0,0,255]),[255,255,255,255]);
  const clipped = mixBalanced([235,235,235,255],[0,255,0,255]);
  assert.equal(clipped[1],255, "a source already at display white can still dominate that channel");
  const milder = mixBalanced([235,235,235,255],[0,200,0,255]);
  const saved = mix([235,235,235,255],[0,200,0,255],{baseExposure:0,participantExposure:0,contrast:12,monochrome:false});
  assert.ok(milder[1]<saved[1], "non-clipped coloured detail should have less highlight headroom");
});

test("balanced mixing validates controls and RGBA chunks, including the zero-balance path", () => {
  for (const invalid of [NaN,Infinity,-3.1,2.1,"0"]) {
    assert.throws(()=>math.createBalancedMixer({baseExposure:invalid}),/exposure must be between/);
    assert.throws(()=>math.createBalancedMixer({participantExposure:invalid}),/exposure must be between/);
  }
  for (const invalid of [NaN,Infinity,-1,31,"12"]) assert.throws(()=>math.createBalancedMixer({contrast:invalid}),/Contrast must be between/);
  for (const invalid of [NaN,Infinity,-1,101,"100"]) assert.throws(()=>math.createBalancedMixer({balanceStrength:invalid}),/Balance must be between/);
  assert.throws(()=>math.createBalancedMixer({monochrome:"false"}),/Monochrome must be/);
  for (const balanceStrength of [0,100]) {
    const settings={baseExposure:-1,participantExposure:0.5,contrast:12,monochrome:false,balanceStrength};
    const mixer=math.createBalancedMixer(settings), output=new Float64Array(first.length).fill(-7);
    mixer(first,second,output,4,12);
    assert.deepEqual(Array.from(output.slice(0,4)),[-7,-7,-7,-7]);
    assert.deepEqual(Array.from(output.slice(12)),[-7,-7,-7,-7]);
    mixer(first,second,output,0,4);mixer(first,second,output,12,first.length);
    assert.deepEqual(Array.from(output),mixBalanced(first,second,settings));
    assert.throws(()=>mixer(first,second,new Uint8ClampedArray(4)),/RGBA dimensions/);
    for (const [start,end] of [[1,4],[0,5],[-4,4],[8,4],[0,first.length+4],[NaN,4]]) assert.throws(()=>mixer(first,second,output,start,end),/aligned RGBA boundaries/);
  }
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
      assert.match(html, /<script\b[^>]*src=["']scripts\.js(?:\?[^"']*)?["']/i);
    }
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
    assert.ok(scripts.length >= 1, file);
    for (const [, attributes, body] of scripts) {
      const reference = attributes.match(/\bsrc=["']([^"']+)["']/i);
      assert.ok(reference, `${file} must use an external script`);
      assert.equal(body.trim(), "", `${file} must not contain JavaScript bodies`);
      if (file === "index.html") {
        assert.match(reference[1], /^[A-Za-z0-9._/-]+\.js(?:\?[A-Za-z0-9._=&-]+)?$/);
        const scriptPath = reference[1].split("?")[0];
        assert.ok(fs.existsSync(path.join(root, scriptPath)), `missing external script ${reference[1]}`);
      } else {
        assert.equal(reference[1], "__BRIDGE_SCRIPT_URL__");
      }
    }
  }
});
