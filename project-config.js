"use strict";

// File storage runs in the Google web app; credentials stay there.
const EXPOSURE_CONFIG = Object.freeze({
  googleScriptUrl: "https://script.google.com/macros/s/AKfycbyzIdwIui57NUjmTMm_XyNMvWNHZixo4UyMedoRtz7Qod4COqvjAbcwGDQounUvsCPv/exec",
  // true: start in black and white. false: keep the photos' colours.
  // Visitors can change this before creating an exposure.
  forceBlackAndWhite: true,
  connectionTimeoutMs: 30000,
  requestTimeoutMs: 120000
});
