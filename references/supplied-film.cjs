'use strict';

/**
 * Black-and-white negative-film-inspired
 * multiple-exposure renderer.
 *
 * A digital photo is already processed, so its
 * original film exposure cannot be recovered
 * exactly.
 *
 * We approximate the inverse photographic
 * response, add exposures in linear light,
 * and apply a simulated film curve.
 */

const LOG_MIN = -16;
const LOG_MAX = 16;

const TOE = -7;
const SHOULDER = 4;
const SOFTNESS = 1.15;

const INVERSE_STEPS = 21;
const INPUT_LUT_SIZE = 8193;
const OUTPUT_LUT_SIZE = 32769;

function clamp(x, low = 0, high = 1) {
  return Math.max(low, Math.min(high, x));
}

function softplus(x) {
  if (x > 32) return x;
  if (x < -32) return Math.exp(x);
  return Math.log1p(Math.exp(x));
}

/**
 * Film characteristic curve.
 *
 * Simulates:
 * - Toe: compression of very low exposures
 * - Straight-line region: main tonal response
 * - Shoulder: compression of high exposures
 */
function baseDensityAt(logH) {
  return SOFTNESS * (
    softplus((logH - TOE) / SOFTNESS) -
    softplus((logH - SHOULDER) / SOFTNESS)
  );
}

const D_MIN = baseDensityAt(LOG_MIN);
const D_MAX = baseDensityAt(LOG_MAX);

function responseAtLogExposure(logH, contrast) {
  const density =
    (baseDensityAt(logH) - D_MIN) /
    (D_MAX - D_MIN);

  return Math.pow(clamp(density), contrast);
}

/**
 * Estimate an original exposure value from
 * the brightness of a processed photograph.
 */
function inverseResponse(y, contrast) {
  if (y <= 0) return 0;
  if (y >= 1) return 2 ** LOG_MAX;

  let low = LOG_MIN;
  let high = LOG_MAX;

  for (let k = 0; k < INVERSE_STEPS; k++) {
    const middle = (low + high) / 2;

    if (
      responseAtLogExposure(middle, contrast) < y
    ) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return 2 ** ((low + high) / 2);
}

/**
 * Convert display-encoded RGB to linear light.
 */
function srgb8ToLinear(byte) {
  const v = byte / 255;

  return v <= 0.04045
    ? v / 12.92
    : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb8(linear) {
  const x = clamp(linear);

  const encoded = x <= 0.0031308
    ? 12.92 * x
    : 1.055 * x ** (1 / 2.4) - 0.055;

  return Math.round(encoded * 255);
}

/**
 * Prepare the film response model.
 *
 * Lookup tables make processing millions of
 * pixels much faster.
 */
function makeModel(contrast = 1) {
  if (
    !Number.isFinite(contrast) ||
    contrast < 0.65 ||
    contrast > 1.5
  ) {
    throw new RangeError(
      'Contrast must be between 0.65 and 1.5'
    );
  }

  const rgbLinear = new Float32Array(256);

  for (let i = 0; i < 256; i++) {
    rgbLinear[i] = srgb8ToLinear(i);
  }

  const inverseLut =
    new Float64Array(INPUT_LUT_SIZE);

  for (let i = 0; i < INPUT_LUT_SIZE; i++) {
    inverseLut[i] = inverseResponse(
      i / (INPUT_LUT_SIZE - 1),
      contrast
    );
  }

  const forwardLut =
    new Uint8Array(OUTPUT_LUT_SIZE);

  for (let i = 0; i < OUTPUT_LUT_SIZE; i++) {
    const logH =
      LOG_MIN +
      (i / (OUTPUT_LUT_SIZE - 1)) *
      (LOG_MAX - LOG_MIN);

    forwardLut[i] = linearToSrgb8(
      responseAtLogExposure(logH, contrast)
    );
  }

  function estimateExposure(linear) {
    if (linear <= 0) return 0;

    if (linear >= 1) {
      return inverseLut[INPUT_LUT_SIZE - 1];
    }

    const coordinate =
      linear * (INPUT_LUT_SIZE - 1);

    const start = Math.floor(coordinate);
    const fraction = coordinate - start;

    return (
      inverseLut[start] * (1 - fraction) +
      inverseLut[start + 1] * fraction
    );
  }

  function developedByte(totalExposure) {
    if (totalExposure <= 0) return 0;

    const logH = Math.log2(totalExposure);

    if (logH <= LOG_MIN) return 0;
    if (logH >= LOG_MAX) return 255;

    const index = Math.round(
      (logH - LOG_MIN) *
      (OUTPUT_LUT_SIZE - 1) /
      (LOG_MAX - LOG_MIN)
    );

    return forwardLut[index];
  }

  return {
    rgbLinear,
    estimateExposure,
    developedByte
  };
}

/**
 * Combine two images, pixel by pixel.
 *
 * first and second contain RGB pixels.
 *
 * evA and evB control the light contributed
 * by each exposure, in photographic stops.
 *
 * mode:
 * "bw"    = black-and-white negative simulation
 * "color" = experimental colour approximation
 */
function combinePixels(first, second, options = {}) {
  if (
    first.length !== second.length ||
    first.length % 3 !== 0
  ) {
    throw new RangeError(
      'Input buffers must have identical RGB dimensions'
    );
  }

  const {
    evA = -1,
    evB = -1,
    contrast = 1,
    mode = 'bw'
  } = options;

  if (
    ![evA, evB].every(
      v =>
        Number.isFinite(v) &&
        v >= -3 &&
        v <= 2
    )
  ) {
    throw new RangeError(
      'Each exposure must be between -3 and +2 EV'
    );
  }

  if (mode !== 'bw' && mode !== 'color') {
    throw new RangeError('Unknown mode');
  }

  const {
    rgbLinear,
    estimateExposure,
    developedByte
  } = makeModel(contrast);

  const multiplierA = 2 ** evA;
  const multiplierB = 2 ** evB;

  const result = Buffer.allocUnsafe(first.length);

  for (let i = 0; i < first.length; i += 3) {

    if (mode === 'bw') {

      // Luminance calculated from linear RGB.
      const lumA =
        0.2126 * rgbLinear[first[i]] +
        0.7152 * rgbLinear[first[i + 1]] +
        0.0722 * rgbLinear[first[i + 2]];

      const lumB =
        0.2126 * rgbLinear[second[i]] +
        0.7152 * rgbLinear[second[i + 1]] +
        0.0722 * rgbLinear[second[i + 2]];

      // The actual double-exposure calculation.
      const total =
        multiplierA * estimateExposure(lumA) +
        multiplierB * estimateExposure(lumB);

      const grey = developedByte(total);

      result[i] = grey;
      result[i + 1] = grey;
      result[i + 2] = grey;

    } else {

      // Experimental colour simulation.
      for (let c = 0; c < 3; c++) {
        const total =
          multiplierA *
          estimateExposure(
            rgbLinear[first[i + c]]
          ) +
          multiplierB *
          estimateExposure(
            rgbLinear[second[i + c]]
          );

        result[i + c] = developedByte(total);
      }
    }
  }

  return result;
}

module.exports = {
  combinePixels,
  makeModel,
  responseAtLogExposure,
  srgb8ToLinear
};