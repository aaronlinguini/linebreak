"use strict";

// Experimental browser port of the supplied film.js, retained as a separate
// renderer for comparison. This assumed curve is not calibrated to a film
// stock or a camera/scan pipeline. Colour applies the same curve per channel.
// The reference's pure-white endpoint (2 ** 16 inferred exposure) is preserved,
// including its jump from almost-white; changing that would be another model.
const FilmExposureMath = (() => {
  const version = "assumed-film-v1";
  const LOG_MIN = -16;
  const LOG_MAX = 16;
  const TOE = -7;
  const SHOULDER = 4;
  const SOFTNESS = 1.15;
  const INVERSE_STEPS = 21;
  const INPUT_LUT_SIZE = 8193;
  const OUTPUT_LUT_SIZE = 32769;
  const CACHE_LIMIT = 4;
  const models = new Map();

  const clamp = (value) => Math.max(0, Math.min(1, value));
  function softplus(value) {
    if (value > 32) return value;
    if (value < -32) return Math.exp(value);
    return Math.log1p(Math.exp(value));
  }
  function baseDensityAt(logExposure) {
    return SOFTNESS * (
      softplus((logExposure - TOE) / SOFTNESS) -
      softplus((logExposure - SHOULDER) / SOFTNESS)
    );
  }
  const minimumDensity = baseDensityAt(LOG_MIN);
  const maximumDensity = baseDensityAt(LOG_MAX);
  function responseAtLogExposure(logExposure, filmContrast) {
    const density = (baseDensityAt(logExposure) - minimumDensity) / (maximumDensity - minimumDensity);
    return Math.pow(clamp(density), filmContrast);
  }
  function inverseResponse(value, filmContrast) {
    if (value <= 0) return 0;
    if (value >= 1) return 2 ** LOG_MAX;
    let low = LOG_MIN;
    let high = LOG_MAX;
    for (let step = 0; step < INVERSE_STEPS; step++) {
      const middle = (low + high) / 2;
      if (responseAtLogExposure(middle, filmContrast) < value) low = middle;
      else high = middle;
    }
    return 2 ** ((low + high) / 2);
  }
  function srgb8ToLinear(byte) {
    const value = byte / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }
  function linearToSrgb8(linear) {
    const value = clamp(linear);
    const encoded = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
    return Math.round(encoded * 255);
  }

  function prepareModel(filmContrast) {
    if (models.has(filmContrast)) {
      const cached = models.get(filmContrast);
      models.delete(filmContrast);
      models.set(filmContrast, cached);
      return cached;
    }
    const rgbLinear = Float32Array.from({ length: 256 }, (_, byte) => srgb8ToLinear(byte));
    const inverseLut = new Float64Array(INPUT_LUT_SIZE);
    for (let index = 0; index < INPUT_LUT_SIZE; index++) {
      inverseLut[index] = inverseResponse(index / (INPUT_LUT_SIZE - 1), filmContrast);
    }
    const forwardLut = new Uint8Array(OUTPUT_LUT_SIZE);
    for (let index = 0; index < OUTPUT_LUT_SIZE; index++) {
      const logExposure = LOG_MIN + index / (OUTPUT_LUT_SIZE - 1) * (LOG_MAX - LOG_MIN);
      forwardLut[index] = linearToSrgb8(responseAtLogExposure(logExposure, filmContrast));
    }
    function estimateExposure(linear) {
      if (linear <= 0) return 0;
      if (linear >= 1) return inverseLut[INPUT_LUT_SIZE - 1];
      const coordinate = linear * (INPUT_LUT_SIZE - 1);
      const start = Math.floor(coordinate);
      const fraction = coordinate - start;
      return inverseLut[start] * (1 - fraction) + inverseLut[start + 1] * fraction;
    }
    function developedByte(totalExposure) {
      if (totalExposure <= 0) return 0;
      const logExposure = Math.log2(totalExposure);
      if (logExposure <= LOG_MIN) return 0;
      if (logExposure >= LOG_MAX) return 255;
      const index = Math.round((logExposure - LOG_MIN) * (OUTPUT_LUT_SIZE - 1) / (LOG_MAX - LOG_MIN));
      return forwardLut[index];
    }
    const model = { rgbLinear, estimateExposure, developedByte };
    models.set(filmContrast, model);
    if (models.size > CACHE_LIMIT) models.delete(models.keys().next().value);
    return model;
  }

  function createMixer({ baseExposure = -1, participantExposure = -1, monochrome = true, filmContrast = 1 } = {}) {
    if (![baseExposure, participantExposure].every((value) => Number.isFinite(value) && value >= -3 && value <= 2)) {
      throw new RangeError("Each exposure must be between -3 and +2 EV.");
    }
    // filmContrast belongs to the assumed response model. It is intentionally
    // separate from the current renderer's display-space contrast (0 = neutral).
    if (!Number.isFinite(filmContrast) || filmContrast < 0.65 || filmContrast > 1.5) {
      throw new RangeError("Film contrast must be between 0.65 and 1.5.");
    }
    if (typeof monochrome !== "boolean") throw new TypeError("Monochrome must be true or false.");
    const { rgbLinear, estimateExposure, developedByte } = prepareModel(filmContrast);
    const multiplierA = 2 ** baseExposure;
    const multiplierB = 2 ** participantExposure;

    return function mix(base, participant, output, start = 0, end = base.length) {
      if (base.length !== participant.length || base.length !== output.length || base.length % 4 !== 0) {
        throw new RangeError("Input and output buffers must have identical RGBA dimensions.");
      }
      if (!Number.isInteger(start) || !Number.isInteger(end) || start % 4 !== 0 || end % 4 !== 0 || start < 0 || end < start || end > base.length) {
        throw new RangeError("Pixel chunks must use aligned RGBA boundaries within the buffers.");
      }
      for (let index = start; index < end; index += 4) {
        if (monochrome) {
          const luminanceA = 0.2126 * rgbLinear[base[index]] + 0.7152 * rgbLinear[base[index + 1]] + 0.0722 * rgbLinear[base[index + 2]];
          const luminanceB = 0.2126 * rgbLinear[participant[index]] + 0.7152 * rgbLinear[participant[index + 1]] + 0.0722 * rgbLinear[participant[index + 2]];
          const totalExposure = multiplierA * estimateExposure(luminanceA) + multiplierB * estimateExposure(luminanceB);
          const grey = developedByte(totalExposure);
          output[index] = output[index + 1] = output[index + 2] = grey;
        } else {
          for (let channel = 0; channel < 3; channel++) {
            const totalExposure = multiplierA * estimateExposure(rgbLinear[base[index + channel]]) + multiplierB * estimateExposure(rgbLinear[participant[index + channel]]);
            output[index + channel] = developedByte(totalExposure);
          }
        }
        output[index + 3] = 255;
      }
    };
  }

  return Object.freeze({
    version,
    createMixer,
    parameters: Object.freeze({ logMin: LOG_MIN, logMax: LOG_MAX, toe: TOE, shoulder: SHOULDER, softness: SOFTNESS })
  });
})();
