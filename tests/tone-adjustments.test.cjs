"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "tone-adjustments.js"), "utf8") + "\nglobalThis.tones = ToneAdjustments;", context);
const tones = context.tones;
const names = ["blacks", "shadows", "mids", "highlights", "whites"];

function apply(settings, pixels, start, end) {
  const output = new Uint8ClampedArray(pixels);
  const mapper = tones.createMapper(settings);
  if (mapper) mapper(output, start, end);
  return Array.from(output);
}

test("neutral tone controls skip processing and preserve every input byte", () => {
  assert.equal(tones.version, "tone-curve-v2");
  assert.equal(tones.createMapper(), null);
  assert.equal(tones.createMapper(Object.fromEntries(names.map((name) => [name, 0]))), null);
  const pixels = [0,0,0,0, 255,255,255,255, 13,147,250,99];
  assert.deepEqual(apply({}, pixels), pixels);
});

test("each control raises and lowers its tone region, with Whites able to lower pure white", () => {
  for (const [name, byte] of [["blacks",13],["shadows",56],["mids",128],["highlights",199],["whites",242]]) {
    const pixel = [byte,byte,byte,71];
    assert.ok(apply({ [name]: 100 },pixel)[0] > byte, `${name} must raise its tone region`);
    assert.ok(apply({ [name]: -100 },pixel)[0] < byte, `${name} must lower its tone region`);
    for (const value of [-100,100]) {
      const white = name === "whites" && value < 0 ? 204 : 255;
      assert.deepEqual(apply({ [name]: value },[0,0,0,13,255,255,255,246]), [0,0,0,13,white,white,white,246]);
    }
  }
});

test("extreme combinations remain monotone and produce smooth neutral grayscale ramps", () => {
  const ramp = Array.from({ length: 256 }, (_, value) => [value,value,value,255]).flat();
  for (let mask = 0; mask < 32; mask++) {
    const settings = Object.fromEntries(names.map((name, index) => [name, mask & (1 << index) ? 100 : -100]));
    const output = apply(settings, ramp);
    assert.equal(output[0], 0);
    assert.equal(output[1020], settings.whites < 0 ? 204 : 255);
    for (let index = 0; index < output.length; index += 4) {
      assert.equal(output[index], output[index + 1]);
      assert.equal(output[index], output[index + 2]);
      assert.equal(output[index + 3], 255);
      if (index > 0) {
        const delta = output[index] - output[index - 4];
        assert.ok(delta >= 0 && delta <= 4, `combination ${mask} must not reverse or jump at ${index / 4}`);
      }
    }
  }
});

test("Whites visibly changes a broad bright range while preserving lower tones", () => {
  const ramp = Array.from({ length: 256 }, (_, value) => [value,value,value,255]).flat();
  let previous = null;
  for (const whites of [-100,-50,0,50,100]) {
    const output = apply({ whites },ramp);
    for (let byte=0;byte<256;byte++) {
      const index = byte*4;
      if (byte<=140) assert.deepEqual(output.slice(index,index+4),ramp.slice(index,index+4), "Whites alone must preserve shadows and lower midtones");
      if (previous) assert.ok(output[index]>=previous[index], "increasing Whites must never darken a tone");
    }
    previous=output;
  }
  assert.deepEqual(apply({ whites:-100 },[225,225,225,71,255,255,255,92]),[197,197,197,71,204,204,204,92]);
  assert.deepEqual(apply({ whites:100 },[225,225,225,71,255,255,255,92]),[253,253,253,71,255,255,255,92]);
});

test("zero Whites preserves the other four controls' exact saved pixels", () => {
  // Captured from fed6171's tone-curve-v1 before the Whites-only revision.
  const pixels=[0,0,0,0,13,13,13,17,56,56,56,48,128,128,128,71,199,199,199,92,242,242,242,118,30,110,210,99,210,100,35,150,255,255,255,255];
  for (const fixture of [
    { settings:{blacks:40,shadows:-50,mids:20,highlights:60}, output:[0,0,0,0,17,17,17,17,43,43,43,48,134,134,134,71,214,214,214,92,242,242,242,118,29,106,202,99,211,105,42,150,255,255,255,255] },
    { settings:{blacks:-100,shadows:100,mids:-100,highlights:100,whites:0}, output:[0,0,0,0,3,3,3,17,82,82,82,48,97,97,97,71,224,224,224,92,242,242,242,118,27,100,191,99,168,80,28,150,255,255,255,255] },
    { settings:{blacks:100,shadows:-100,mids:100,highlights:-100,whites:0}, output:[0,0,0,0,23,23,23,17,31,31,31,48,158,158,158,71,173,173,173,92,242,242,242,118,52,124,214,99,221,137,88,150,255,255,255,255] }
  ]) assert.deepEqual(apply(fixture.settings,pixels),fixture.output);
});

test("colour adjustments move all channels toward the same endpoint and leave alpha untouched", () => {
  const pixel = [30,110,210,47];
  const dark = apply({ mids:-100 },pixel);
  const light = apply({ mids:100 },pixel);
  assert.equal(dark[3],47);
  assert.equal(light[3],47);
  for (let channel=0;channel<3;channel++) {
    assert.ok(dark[channel]<pixel[channel]);
    assert.ok(light[channel]>pixel[channel]);
    assert.ok(Math.abs(dark[channel]/pixel[channel]-dark[1]/pixel[1])<0.03);
    assert.ok(Math.abs((255-light[channel])/(255-pixel[channel])-(255-light[1])/(255-pixel[1]))<0.03);
  }
});

test("chunks match a complete pass and do not alter pixels outside their range", () => {
  const pixels = [20,30,50,71, 70,80,90,92, 130,150,170,0, 225,230,235,255];
  const settings = { blacks:40, shadows:-50, mids:20, highlights:60, whites:-25 };
  const partial = apply(settings,pixels,4,12);
  const full = apply(settings,pixels);
  assert.deepEqual(partial.slice(0,4), pixels.slice(0,4));
  assert.deepEqual(partial.slice(12), pixels.slice(12));
  assert.deepEqual(partial.slice(4,12), full.slice(4,12));
  const output = new Uint8ClampedArray(pixels);
  const mapper = tones.createMapper(settings);
  mapper(output,0,4); mapper(output,4,12); mapper(output,12,16);
  assert.deepEqual(Array.from(output), full);
});

test("invalid controls and misaligned chunks fail clearly", () => {
  for (const name of names) {
    for (const value of [null,NaN,Infinity,-101,101,"0"]) {
      assert.throws(() => tones.createMapper({ [name]:value }), /between -100 and 100/);
    }
  }
  for (const value of [null,[],"invalid"]) assert.throws(() => tones.createMapper(value), /must be an object/);
  const mapper = tones.createMapper({ mids:10 });
  for (const [start,end] of [[1,4],[0,5],[-4,4],[8,4],[0,12],[NaN,4]]) {
    assert.throws(() => mapper(new Uint8ClampedArray(8),start,end), /aligned RGBA chunks/);
  }
  assert.throws(() => mapper(new Uint8ClampedArray(7)), /aligned RGBA chunks/);
});
