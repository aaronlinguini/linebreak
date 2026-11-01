const MAX_BYTES = 30 * 1024 * 1024;
const MAX_PIXELS = 80000000;
const TIMEOUT_MS = 120000;
const completed = new Map();
const pending = new Map();

function jpegName(file) {
  return String(file.name || "photograph").replace(/\.(heic|heif)$/i, "") + ".jpg";
}

function timed(task) {
  let timer;
  return Promise.race([task, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Converting this HEIC photo took too long. Please try a smaller photo.")), TIMEOUT_MS);
  })]).finally(() => clearTimeout(timer));
}

function dimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) {
    throw new Error("This HEIC photo is too large to process safely. Please choose a smaller photo.");
  }
}

async function encode(source, width, height) {
  dimensions(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext("2d", { colorSpace: "srgb" });
    if (!context) throw new Error("This browser cannot convert the HEIC photo.");
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    // Keep the decoded orientation; the exposure processor rotates portraits.
    context.drawImage(source, 0, 0, width, height);
    const blob = await timed(new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.97)));
    if (!blob || blob.type !== "image/jpeg" || !blob.size || blob.size > MAX_BYTES) {
      throw new Error("The converted photo could not be prepared within the 30 MB limit.");
    }
    const signature = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
    if (signature[0] !== 255 || signature[1] !== 216 || signature[2] !== 255) {
      throw new Error("The converted photo is not a valid JPEG.");
    }
    return blob;
  } finally { canvas.width = canvas.height = 1; }
}

async function convert(file, loadDecoder) {
  const image = new Image();
  const url = URL.createObjectURL(file);
  let native = false;
  try {
    image.src = url;
    try { await timed(image.decode()); native = true; }
    catch (error) {
      if (/took too long/.test(error.message || "")) throw error;
    }
    if (native) return await encode(image, image.naturalWidth, image.naturalHeight);
  } finally { image.src = ""; URL.revokeObjectURL(url); }

  const decoder = await timed(loadDecoder());
  let bitmap;
  let accepting = true;
  try {
    const decoding = Promise.resolve(decoder.heicTo({ blob: file, type: "bitmap" })).then(result => {
      if (!accepting) { result?.close?.(); return null; }
      return result;
    });
    bitmap = await timed(decoding);
    return await encode(bitmap, bitmap.width, bitmap.height);
  } catch (error) {
    throw new Error(error instanceof Error && /too large|30 MB|took too long/.test(error.message)
      ? error.message : "This HEIC photo could not be converted. Please try another photo.");
  } finally { accepting = false; bitmap?.close?.(); }
}

export async function normalizeHeic(file, { loadDecoder = () => import("./vendor/heic-to/heic-to.js?v=891a8087d75c3ca093427a643c677b10fc7f9c4f9181583dcb989bc805e75f6e") } = {}) {
  if (!file || !file.size || file.size > MAX_BYTES) {
    throw new Error("Choose a HEIC photo smaller than 30 MB.");
  }
  const header = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  // A phone may already have supplied JPEG bytes under the old HEIC filename.
  if (header[0] === 255 && header[1] === 216 && header[2] === 255) {
    return file.type === "image/jpeg" ? file
      : new File([file], jpegName(file), { type: "image/jpeg", lastModified: file.lastModified });
  }
  const text = offset => String.fromCharCode(...header.subarray(offset, offset + 4));
  const brands = [text(8)];
  for (let offset = 16; offset + 4 <= header.length; offset += 4) brands.push(text(offset));
  if (text(4) !== "ftyp" || brands.some(brand => brand === "avif" || brand === "avis") ||
      !brands.some(brand => ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"].includes(brand))) {
    throw new Error("This file is not a supported HEIC photo.");
  }
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  let blob = completed.get(hash);
  if (!blob) {
    if (!pending.has(hash)) {
      const request = convert(file, loadDecoder).then(result => {
        completed.set(hash, result);
        while (completed.size > 2) completed.delete(completed.keys().next().value);
        return result;
      }).finally(() => pending.delete(hash));
      pending.set(hash, request);
    }
    blob = await pending.get(hash);
  } else {
    completed.delete(hash);
    completed.set(hash, blob);
  }
  return new File([blob], jpegName(file), { type: "image/jpeg", lastModified: file.lastModified });
}
