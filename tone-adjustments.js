"use strict";

// Optional finishing controls for the local comparison. The exposure mixers
// remain separate, and neutral controls skip this pass entirely.
const ToneAdjustments = (() => {
  const names = ["blacks", "shadows", "mids", "highlights", "whites"];
  const knots = [0, 0.05, 0.22, 0.5, 0.78, 0.95, 1];
  const ranges = [0.04, 0.10, 0.12, 0.10, 0.04];
  const tableSize = 4097;

  function createMapper(tones = {}) {
    if (tones === null || typeof tones !== "object" || Array.isArray(tones)) {
      throw new TypeError("Tone adjustments must be an object.");
    }
    const values = names.map((name) => tones[name] === undefined ? 0 : tones[name]);
    if (values.some((value) => !Number.isFinite(value) || value < -100 || value > 100)) {
      throw new RangeError("Each tone adjustment must be between -100 and 100.");
    }
    if (values.every((value) => value === 0)) return null;

    // These bounded offsets keep adjacent knots ordered even when neighbouring
    // controls are at opposite extremes. Black and white endpoints stay fixed.
    const targets = [0, ...values.map((value, index) => knots[index + 1] + value / 100 * ranges[index]), 1];
    const secants = knots.slice(1).map((x, index) => (targets[index + 1] - targets[index]) / (x - knots[index]));
    // Limiting both endpoint tangents to each segment's secant prevents folds
    // and overshoot while joining the segments with continuous slopes.
    const tangents = [secants[0], ...secants.slice(1).map((slope, index) => Math.min(secants[index], slope)), secants.at(-1)];
    let segment = 0;
    const table = Float64Array.from({ length: tableSize }, (_, index) => {
      const x = index / (tableSize - 1);
      while (segment < knots.length - 2 && x > knots[segment + 1]) segment++;
      const width = knots[segment + 1] - knots[segment];
      const t = (x - knots[segment]) / width;
      const t2 = t * t;
      const t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * targets[segment]
        + (t3 - 2 * t2 + t) * width * tangents[segment]
        + (-2 * t3 + 3 * t2) * targets[segment + 1]
        + (t3 - t2) * width * tangents[segment + 1];
    });

    return function adjust(output, start = 0, end = output.length) {
      if (output.length % 4 !== 0 || !Number.isInteger(start) || !Number.isInteger(end)
        || start % 4 !== 0 || end % 4 !== 0 || start < 0 || end < start || end > output.length) {
        throw new RangeError("Tone adjustments need aligned RGBA chunks within the buffer.");
      }
      for (let index = start; index < end; index += 4) {
        const red = output[index] / 255;
        const green = output[index + 1] / 255;
        const blue = output[index + 2] / 255;
        // Display-space brightness selects the tone region. Apply one shared
        // move toward black or white, keeping colours in gamut and grays neutral.
        const brightness = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        const coordinate = brightness * (tableSize - 1);
        const lower = Math.min(tableSize - 2, Math.floor(coordinate));
        const fraction = coordinate - lower;
        const target = table[lower] * (1 - fraction) + table[lower + 1] * fraction;
        if (target < brightness && brightness > 0) {
          const scale = target / brightness;
          output[index] = Math.round(red * scale * 255);
          output[index + 1] = Math.round(green * scale * 255);
          output[index + 2] = Math.round(blue * scale * 255);
        } else if (target > brightness && brightness < 1) {
          const lift = (target - brightness) / (1 - brightness);
          output[index] = Math.round((red + (1 - red) * lift) * 255);
          output[index + 1] = Math.round((green + (1 - green) * lift) * 255);
          output[index + 2] = Math.round((blue + (1 - blue) * lift) * 255);
        }
      }
    };
  }

  return Object.freeze({ version: "tone-curve-v1", createMapper });
})();
