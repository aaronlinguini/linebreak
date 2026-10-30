"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "scripts.js"), "utf8");
const pixel = (label) => [label, label + 10, label + 20, label + 30];
const pixels = (labels) => labels.flatMap(pixel);

function harness({ failEncoding = false, deferEncoding = false } = {}) {
  const canvases = [];
  const encodings = [];
  const pending = [];
  class ImageData {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  }
  function makeCanvas(width = 1, height = 1, data = []) {
    let currentWidth = width;
    let currentHeight = height;
    let current = new Uint8ClampedArray(width * height * 4);
    current.set(data);
    const canvas = {
      get width() { return currentWidth; },
      set width(value) { currentWidth = value; current = new Uint8ClampedArray(currentWidth * currentHeight * 4); },
      get height() { return currentHeight; },
      set height(value) { currentHeight = value; current = new Uint8ClampedArray(currentWidth * currentHeight * 4); },
      get pixels() { return Array.from(current); },
      getContext(type) {
        assert.equal(type, "2d");
        return {
          createImageData(width, height) { return new ImageData(width, height); },
          getImageData(x, y, width, height) {
            assert.deepEqual([x,y,width,height], [0,0,currentWidth,currentHeight]);
            const image = new ImageData(width, height);
            image.data.set(current);
            return image;
          },
          putImageData(image, x, y) {
            assert.deepEqual([x,y], [0,0]);
            assert.deepEqual([image.width,image.height], [currentWidth,currentHeight]);
            current = new Uint8ClampedArray(image.data);
          },
          drawImage() { throw new Error("Result rotation must permute pixels without interpolation."); }
        };
      },
      toBlob(callback, type, quality) {
        const blob = { type, width: currentWidth, height: currentHeight, pixels: Array.from(current) };
        encodings.push({ type, quality, blob });
        if (deferEncoding) pending.push(() => callback(failEncoding ? null : blob));
        else callback(failEncoding ? null : blob);
      }
    };
    return canvas;
  }
  const sandbox = vm.createContext({
    ImageData, setTimeout,
    document: {
      getElementById() { return null; },
      createElement(tag) {
        assert.equal(tag, "canvas");
        const canvas = makeCanvas();
        canvases.push(canvas);
        return canvas;
      }
    }
  });
  vm.runInContext(source, sandbox);
  return {
    rotate: sandbox.rotateExposureCanvas,
    canvas: makeCanvas(3,2,pixels([1,2,3,4,5,6])),
    makeCanvas, canvases, encodings,
    completeEncoding() { assert.equal(pending.length,1); pending.shift()(); }
  };
}

test("right-angle rotations preserve every RGBA byte and the downloaded orientation", async () => {
  for (const [turns,width,height,labels] of [
    [0,3,2,[1,2,3,4,5,6]],
    [1,2,3,[4,1,5,2,6,3]],
    [2,3,2,[6,5,4,3,2,1]],
    [3,2,3,[3,6,2,5,1,4]]
  ]) {
    const h = harness();
    const result = await h.rotate(h.canvas, turns);
    assert.deepEqual([h.canvas.width,h.canvas.height], [width,height]);
    assert.deepEqual(h.canvas.pixels, pixels(labels));
    assert.deepEqual([result.width,result.height], [width,height]);
    assert.deepEqual(result.blob.pixels, h.canvas.pixels);
    assert.deepEqual([result.blob.width,result.blob.height], [width,height]);
    assert.equal(h.encodings.length,1);
    assert.equal(h.encodings[0].type,"image/jpeg");
    assert.equal(h.encodings[0].quality,0.95);
    assert.ok(h.canvases.every((canvas) => canvas.width === 1 && canvas.height === 1), "scratch backing pixels must be released");
  }
});

test("four clockwise turns restore the original dimensions and pixels exactly", async () => {
  const h = harness();
  const original = h.canvas.pixels;
  for (let index=0;index<4;index++) await h.rotate(h.canvas);
  assert.deepEqual([h.canvas.width,h.canvas.height], [3,2]);
  assert.deepEqual(h.canvas.pixels, original);
});

test("a failed export leaves the displayed result intact", async () => {
  const h = harness({ failEncoding:true, deferEncoding:true });
  const original = h.canvas.pixels;
  const rotation = h.rotate(h.canvas);
  await Promise.resolve();
  assert.deepEqual([h.canvas.width,h.canvas.height], [3,2]);
  assert.deepEqual(h.canvas.pixels,original);
  h.completeEncoding();
  await assert.rejects(rotation);
  assert.deepEqual([h.canvas.width,h.canvas.height], [3,2]);
  assert.deepEqual(h.canvas.pixels,original);
  assert.ok(h.canvases.every((canvas) => canvas.width === 1 && canvas.height === 1));
});

test("invalid rotation settings and empty results cannot overwrite an image", async () => {
  const h = harness();
  const original = h.canvas.pixels;
  for (const turns of [-1,4,1.5,NaN,Infinity,"1",null]) {
    await assert.rejects(h.rotate(h.canvas,turns));
    assert.deepEqual([h.canvas.width,h.canvas.height], [3,2]);
    assert.deepEqual(h.canvas.pixels,original);
  }
  for (const [width,height] of [[0,2],[2,0]]) await assert.rejects(h.rotate(h.makeCanvas(width,height)));
  assert.equal(h.encodings.length,0);
});
