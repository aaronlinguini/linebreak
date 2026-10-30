"use strict";

// Paste the public /exec URL from your Google Apps Script web-app deployment.
// This URL is public configuration. Never put Google passwords or tokens here.
const EXPOSURE_CONFIG = Object.freeze({
  googleScriptUrl: "https://script.google.com/macros/s/AKfycbyzIdwIui57NUjmTMm_XyNMvWNHZixo4UyMedoRtz7Qod4COqvjAbcwGDQounUvsCPv/exec",
  // Artist default for the Black and white checkbox; visitors can change it.
  // false starts in colour, preserving photographs that are already B&W.
  forceBlackAndWhite: true,
  connectionTimeoutMs: 30000,
  requestTimeoutMs: 120000
});
