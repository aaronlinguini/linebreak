"use strict";

// Paste the public /exec URL from your Google Apps Script web-app deployment.
// This URL is public configuration. Never put Google passwords or tokens here.
const EXPOSURE_CONFIG = Object.freeze({
  googleScriptUrl: "https://script.google.com/macros/s/AKfycbyzIdwIui57NUjmTMm_XyNMvWNHZixo4UyMedoRtz7Qod4COqvjAbcwGDQounUvsCPv/exec",
  // Artist option: true makes all double exposures black and white.
  // false preserves each photograph's colours, including existing B&W photos.
  forceBlackAndWhite: true,
  connectionTimeoutMs: 30000,
  requestTimeoutMs: 120000
});
