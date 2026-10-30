"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "artist-import.js"), "utf8");
const html = fs.readFileSync(path.join(root, "google-apps-script/Artist.html"), "utf8");
const maximum = 30 * 1024 * 1024;
const status = {
  ok: true,
  data: { artistCount: 2, maxOriginalBytes: maximum, folders: {
    root: "https://drive.google.com/drive/folders/project-123",
    artist: "https://drive.google.com/drive/u/0/folders/artist-123",
    originals: "https://example.test/not-a-drive-folder",
    results: "javascript:alert(1)"
  } }
};
const imported = (count) => ({ ok: true, data: { imported: true, duplicate: false, artistCount: count } });
const duplicate = (count) => ({ ok: true, data: { imported: false, duplicate: true, artistCount: count } });
const photo = (name, bytes = [0, 255, 27, 80], type = "image/jpeg", size = bytes.length) => ({ name, bytes: Buffer.from(bytes), type, size });

function harness({ replies = {}, missingGoogle = false } = {}) {
  const elements = new Map(), listeners = new Map(), windowListeners = new Map(), timers = new Map();
  const requests = [], reads = [], pending = [];
  let nextTimer = 0, activeImports = 0, maxActiveImports = 0;
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) {
    let value = "";
    const element = {
      hidden: /summary|error|results|folders|folder-/.test(id), disabled: /photo-input|import-button/.test(id),
      textContent: "", files: [], children: [], attributes: {},
      addEventListener(type, callback) { listeners.set(`${id}:${type}`, callback); },
      setAttribute(name, attribute) { this.attributes[name] = attribute; },
      append(child) { this.children.push(child); },
      replaceChildren() { this.children = []; }
    };
    Object.defineProperty(element, "value", { get() { return value; }, set(next) { value = next; if (id === "artist-photo-input" && !next) this.files = []; } });
    elements.set(id, element);
  }
  const sandbox = {
    URL, Error, setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    document: {
      getElementById(id) { return elements.get(id); },
      createElement(name) { assert.equal(name, "li"); return { textContent: "", className: "" }; }
    },
    window: { addEventListener(type, callback) { windowListeners.set(type, callback); } },
    FileReader: class {
      readAsDataURL(file) {
        reads.push(file);
        this.ready = true;
        Promise.resolve().then(() => {
          if (!this.ready) return;
          if (file.readError) this.onerror?.();
          else { this.result = `data:${file.type || "application/octet-stream"};base64,${file.bytes.toString("base64")}`; this.onload?.(); }
        });
      }
      abort() { this.ready = false; this.onabort?.(); }
    }
  };
  if (!missingGoogle) sandbox.google = { script: { get run() {
    return {
      withSuccessHandler(callback) { this.success = callback; return this; },
      withFailureHandler(callback) { this.failure = callback; return this; },
      artistApi(request) {
        requests.push(JSON.parse(JSON.stringify(request)));
        if (request.action === "import") { activeImports++; maxActiveImports = Math.max(maxActiveImports, activeImports); }
        const finish = (response) => {
          if (request.action === "import") activeImports--;
          if (response?.failure) this.failure(response.failure);
          else this.success(response);
        };
        const response = replies[request.action]?.shift() ?? (request.action === "import" ? imported(3) : status);
        if (response === "pending") pending.push(finish);
        else Promise.resolve().then(() => finish(response));
      }
    };
  } } };
  vm.runInNewContext(source, sandbox);
  const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
  return {
    elements, requests, reads, pending, timers, flush, windowListeners,
    maxActive: () => maxActiveImports,
    async select(files) { elements.get("artist-photo-input").files = files; await listeners.get("artist-photo-input:change")?.({}); },
    submit() { return listeners.get("artist-import-form:submit")({ preventDefault() {} }); },
    refresh() { return listeners.get("artist-refresh-button:click")({}); },
    results: () => elements.get("artist-results").children.map((item) => item.textContent)
  };
}

test("the private artist page separates HTML, CSS and JavaScript and has accessible upload controls", () => {
  assert.doesNotMatch(html, /<style\b|\sstyle\s*=|\son[a-z]+\s*=/i);
  for (const [, attributes, contents] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    assert.match(attributes, /src="__ARTIST_SCRIPT_URL__"/);
    assert.equal(contents.trim(), "");
  }
  assert.match(html, /<link\b[^>]*href="__ARTIST_STYLE_URL__"/);
  assert.match(html, /<label\b[^>]*for="artist-photo-input"/);
  assert.match(html, /id="artist-photo-input"[^>]*\bmultiple\b[^>]*aria-describedby="artist-file-help"/);
  assert.match(html, /id="artist-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="artist-error"[^>]*role="alert"/);
  assert.doesNotMatch(source, /getOAuthToken|access_token|client_secret|DriveApp|fetch\(/);
  const css = fs.readFileSync(path.join(root, "artist-import.css"), "utf8");
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\s*\(max-width:\s*480px\)/);
});

test("the page loads owner status, shows the count and only trusted project-folder links", async () => {
  const h = harness();
  assert.equal(h.elements.get("artist-photo-input").disabled, true);
  await h.flush();
  assert.deepEqual(h.requests, [{ action: "status", payload: {} }]);
  assert.equal(h.elements.get("artist-count").textContent, "2");
  assert.equal(h.elements.get("artist-photo-input").disabled, false);
  assert.equal(h.elements.get("artist-import-button").disabled, true);
  assert.equal(h.elements.get("artist-folder-root").href, status.data.folders.root);
  assert.equal(h.elements.get("artist-folder-artist").href, status.data.folders.artist);
  assert.equal(h.elements.get("artist-folder-originals").hidden, true);
  assert.equal(h.elements.get("artist-folder-results").hidden, true);
  assert.equal(h.timers.size, 0);
});

test("imports are sequential, preserve exact source bytes and report duplicates without extra upload attempts", async () => {
  const h = harness({ replies: { import: [imported(3), duplicate(3)] } });
  await h.flush();
  const files = [photo('<first & photo>.jpg'), photo("same-photo.png", [137, 80, 78, 71], "image/png")];
  await h.select(files);
  assert.equal(h.elements.get("artist-import-button").disabled, false);
  await h.submit();
  assert.equal(h.maxActive(), 1);
  assert.deepEqual(h.requests.filter((request) => request.action === "import"), files.map((file) => ({
    action: "import", payload: { image: { name: file.name, mimeType: file.type, base64: file.bytes.toString("base64") } }
  })));
  assert.deepEqual(h.results(), ["<first & photo>.jpg: imported.", "same-photo.png: already in the collection."]);
  assert.equal(h.elements.get("artist-count").textContent, "3");
  assert.equal(h.elements.get("artist-status").textContent, "1 imported · 1 already present · 0 not confirmed.");
  assert.equal(h.elements.get("artist-photo-input").files.length, 0);
  assert.equal(h.elements.get("artist-import-button").disabled, true);
});

test("unsupported, oversized and unreadable files report per-file errors and do not prevent the remaining imports", async () => {
  const h = harness();
  await h.flush();
  const unreadable = photo("unreadable.jpg"); unreadable.readError = true;
  await h.select([photo("not-jpeg.jpg", [1], "image/heic"), photo("huge.jpg", [1], "image/jpeg", maximum + 1), unreadable, photo("good.avif", [1, 2], "image/avif")]);
  await h.submit();
  assert.equal(h.reads.length, 2);
  assert.equal(h.requests.filter((request) => request.action === "import").length, 1);
  assert.equal(h.results().length, 4);
  assert.match(h.results()[0], /HEIC or RAW/);
  assert.match(h.results()[1], /up to 30 MB/);
  assert.match(h.results()[2], /could not be read/);
  assert.equal(h.results()[3], "good.avif: imported.");
  assert.equal(h.elements.get("artist-photo-input").files.length, 4, "failed selections stay available for an explicit retry");
  assert.equal(h.elements.get("artist-status").textContent, "1 imported · 0 already present · 3 not confirmed.");
});

test("server failures stay unconfirmed and retrying is explicit rather than automatic", async () => {
  const h = harness({ replies: { import: [{ ok: false, error: { message: "Owner authorization required." } }, duplicate(2)] } });
  await h.flush();
  await h.select([photo("retry.jpg")]);
  await h.submit();
  assert.equal(h.requests.filter((request) => request.action === "import").length, 1);
  assert.match(h.results()[0], /Owner authorization required/);
  assert.equal(h.elements.get("artist-import-button").disabled, false);
  await h.submit();
  assert.equal(h.requests.filter((request) => request.action === "import").length, 2);
  assert.deepEqual(h.results(), ["retry.jpg: already in the collection."]);
});

test("missing Google RPC or a rejected status cannot enable imports and Check collection retries safely", async () => {
  const unavailable = harness({ missingGoogle: true });
  await unavailable.flush();
  assert.equal(unavailable.elements.get("artist-photo-input").disabled, true);
  assert.match(unavailable.elements.get("artist-error").textContent, /deployed Google Apps Script/);
  const h = harness({ replies: { status: [{ ok: false, error: { message: "Not the project owner." } }, status] } });
  await h.flush();
  assert.equal(h.elements.get("artist-photo-input").disabled, true);
  assert.match(h.elements.get("artist-error").textContent, /Not the project owner/);
  await h.refresh();
  assert.equal(h.elements.get("artist-photo-input").disabled, false);
  assert.deepEqual(h.requests.map((request) => request.action), ["status", "status"]);
  await h.refresh();
  assert.deepEqual(h.requests.map((request) => request.action), ["status", "status", "refresh"]);
});

test("a timed-out import is not repeated and a late RPC callback cannot change its failed result", async () => {
  const h = harness({ replies: { import: ["pending"] } });
  await h.flush();
  await h.select([photo("slow.jpg")]);
  const operation = h.submit();
  await h.flush();
  assert.equal(h.pending.length, 1);
  assert.equal(h.elements.get("artist-photo-input").disabled, true);
  const timeout = [...h.timers.values()][0]; timeout();
  await operation;
  assert.match(h.results()[0], /may already be saved/);
  assert.equal(h.requests.filter((request) => request.action === "import").length, 1);
  h.pending[0](imported(3));
  await h.flush();
  assert.match(h.results()[0], /may already be saved/);
  assert.equal(h.elements.get("artist-count").textContent, "2");
});

test("leaving the page prevents subsequent imports in a selected batch", async () => {
  const h = harness({ replies: { import: ["pending"] } });
  await h.flush();
  await h.select([photo("first.jpg"), photo("second.jpg")]);
  const operation = h.submit();
  await h.flush();
  h.windowListeners.get("pagehide")();
  h.pending[0](imported(3));
  await operation;
  assert.equal(h.requests.filter((request) => request.action === "import").length, 1);
  assert.equal(h.reads.length, 1);
});
