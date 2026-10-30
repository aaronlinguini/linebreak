// Generated from drive-bridge.js; rebuild with node scripts/build-google-client.cjs.
function exposureBridgeClient_() {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") return;
  const PROTOCOL = "double-exposure-archive-v1";
  const originMeta = document.querySelector('meta[name="exposure-parent-origin"]');
  const channelMeta = document.querySelector('meta[name="exposure-channel"]');
  const parentOrigin = originMeta && originMeta.content;
  const channel = channelMeta && channelMeta.content;
  let parsedOrigin;
  try { parsedOrigin = new URL(parentOrigin); } catch { return; }
  if (!parsedOrigin || !["https:", "http:"].includes(parsedOrigin.protocol) ||
      parsedOrigin.origin !== parentOrigin || !/^[a-f0-9]{32}$/i.test(channel || "")) return;

  // Send messages to the website, outside Google's extra frames.
  const host = window.top;
  if (!host || host === window) return;
  const allowedActions = new Set(["bootstrap", "begin", "complete"]);
  const seen = new Set();
  let acknowledged = false;
  let readyTimer;

  function send(type, values = {}) {
    host.postMessage({ protocol: PROTOCOL, channel, type, ...values }, parentOrigin);
  }

  function ready() {
    if (!acknowledged) send("ready");
  }

  function respond(id, response) {
    send("response", { id, response });
  }

  function failure(id, code, message) {
    respond(id, { ok: false, error: { code, message } });
  }

  function receive(event) {
    if (event.origin !== parentOrigin || event.source !== host) return;
    const message = event.data;
    if (!message || typeof message !== "object" || message.protocol !== PROTOCOL || message.channel !== channel) return;
    if (message.type === "ack") {
      acknowledged = true;
      clearInterval(readyTimer);
      return;
    }
    if (!acknowledged || message.type !== "request" || typeof message.id !== "string" ||
        !/^[A-Za-z0-9._:-]{1,200}$/.test(message.id)) return;
    if (seen.has(message.id)) return;
    seen.add(message.id);
    if (seen.size > 256) seen.delete(seen.values().next().value);
    const request = message.request;
    if (!request || !allowedActions.has(request.action) || !request.payload || typeof request.payload !== "object") {
      failure(message.id, "INVALID_REQUEST", "This archive request is not supported.");
      return;
    }
    if (typeof google === "undefined" || !google.script || !google.script.run) {
      failure(message.id, "BRIDGE_UNAVAILABLE", "The Google archive connection is unavailable.");
      return;
    }
    try {
      google.script.run
        .withSuccessHandler((response) => {
          if (!response || typeof response !== "object" || typeof response.ok !== "boolean") {
            failure(message.id, "INVALID_RESPONSE", "The archive returned an unreadable response.");
          } else {
            respond(message.id, response);
          }
        })
        .withFailureHandler((error) => failure(message.id, "RPC_FAILURE",
          error && typeof error.message === "string" ? error.message : "The archive could not finish this request."))
        .exposureApi({ action: request.action, payload: request.payload });
    } catch (error) {
      failure(message.id, "RPC_FAILURE", error && error.message ? error.message : "The archive request could not be sent.");
    }
  }

  window.addEventListener("message", receive);
  window.addEventListener("pagehide", () => {
    clearInterval(readyTimer);
    window.removeEventListener("message", receive);
  }, { once: true });
  readyTimer = setInterval(ready, 500);
  ready();
}
