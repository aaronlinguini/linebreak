"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { REFLECTION_PAGES, renderReflections, embedReflections } = require("../reflections.js");

const project = path.resolve(__dirname, "..");

function realPages() {
  return new Map(REFLECTION_PAGES.map(filename => [filename, fs.readFileSync(path.join(project, filename), "utf8")]));
}

function fixturePages() {
  const pages = realPages();
  pages.set("experiment-1.html", `<!doctype html>
    <html lang="en"><head><title>Experiment 1 — Light &amp; Memory</title></head><body>
      <main>
        <div class="experiment-gallery" data-carousel>
          <div class="experiment-entries">
            <!-- <section class="experiment-entry"><div class="experiment-photo-note"><p>Commented note.</p></div></section> -->
            <section class="experiment-entry" hidden>
              <div class="experiment-comparison"><figure><img src="first.jpg" alt="First"></figure><figure><img src="second.jpg" alt="Second"></figure></div>
              <div class="experiment-photo-note"><p>First &amp; second, with <strong>emphasis</strong> and <em>care</em>.</p><div><p>A nested paragraph stays complete.</p></div><p>The final paragraph stays too.</p></div>
            </section>
            <section class="experiment-entry"><figure><img src="third.jpg" alt="Third"></figure><div class="experiment-reflection"><p> </p><!-- Unwritten reflection. --></div></section>
            <section class="experiment-entry"><figure><img src="fourth.jpg" alt="Fourth"></figure><div class="experiment-reflection"><p>Third group&#x27;s reflection.</p></div></section>
          </div>
          <div class="carousel-controls"><button>Previous</button><button>Next</button></div>
        </div>
        <section class="experiment-reflection experiment-introduction" aria-labelledby="original-heading"><h2 id="original-heading">The main reflection</h2><p>A general reflection<br>with its original line break.</p></section>
      </main>
    </body></html>`);
  return pages;
}

test("the reading view follows all four experiment pages in their existing order", () => {
  assert.deepEqual(REFLECTION_PAGES, ["experiment-1.html", "experiment-2-part-1.html", "experiment-2-part-2.html", "experiment-3.html"]);
  const html = renderReflections(realPages());
  let previous = -1;
  for (const filename of REFLECTION_PAGES) {
    const id = filename.replace(/\.html$/, "");
    assert.ok(html.includes(`href="#${id}"`), `${filename}: contents link`);
    const position = html.indexOf(`id="${id}"`);
    assert.ok(position > previous, `${filename}: section order`);
    previous = position;
  }
});

test("the real Part 2 notes retain their gallery positions rather than counting individual photos", () => {
  const html = renderReflections(realPages());
  assert.deepEqual([...html.matchAll(/<h3\b[^>]*>\s*Image group (\d+\/\d+)\s*<\/h3>/g)].map(match => match[1]),
    ["1/8", "2/8", "4/8", "7/8", "8/8"]);
  assert.ok(html.includes("Initially, I thought this was a landscape oriented photo"));
  assert.ok(html.includes("In the process of deciphering these photos for myself"));
  assert.ok(html.includes("the least personal, I guess?"));
  assert.ok(html.includes("<strong>Some of the more complex photos,</strong> particularly my <strong>double exposures</strong>"));
  assert.ok(html.includes("And then the blank photos, things that aren’t visible at all"));
});

test("all main reflections are available without images, carousel controls, or hidden slides", () => {
  const html = renderReflections(realPages());
  for (const heading of ["Forming a Sketch with Temporally Ambiguous Photos", "Before processing the photos", "After processing the photos", "Apparitions"]) {
    assert.ok(html.includes(heading), `${heading}: main reflection included`);
  }
  assert.doesNotMatch(html, /<(?:img|picture|figure|button)\b/i);
  assert.doesNotMatch(html, /\b(?:hidden|aria-hidden)\s*(?:=|>)/i);
  assert.doesNotMatch(html, /carousel-controls|data-carousel/);
  assert.doesNotMatch(html, /<p>\s*<\/p>/);
});

test("nested reflection markup, entities, and emphasis survive while empty or commented notes are skipped", () => {
  const pages = fixturePages();
  const original = pages.get("experiment-1.html");
  const html = renderReflections(pages);
  assert.ok(html.includes("Experiment 1 — Light &amp; Memory"));
  assert.match(html, /<h3\b[^>]*>The main reflection<\/h3>/);
  assert.ok(html.includes("<p>A general reflection<br>with its original line break.</p>"));
  assert.ok(html.includes("<p>First &amp; second, with <strong>emphasis</strong> and <em>care</em>.</p>"));
  assert.ok(html.includes("<div><p>A nested paragraph stays complete.</p></div><p>The final paragraph stays too.</p>"));
  assert.ok(html.includes("<p>Third group&#x27;s reflection.</p>"));
  assert.match(html, /Image group 1\/3/);
  assert.match(html, /Image group 3\/3/);
  assert.doesNotMatch(html, /Image group 2\/3|Commented note|Unwritten reflection/);
  assert.doesNotMatch(html, /<(?:img|figure|button)\b/i);
  assert.equal(pages.get("experiment-1.html"), original, "rendering must leave editable source untouched");
});

test("adding a gallery group updates the denominator without inventing a reflection for it", () => {
  const pages = fixturePages();
  pages.set("experiment-1.html", pages.get("experiment-1.html").replace('<div class="experiment-entries">',
    '<div class="experiment-entries"><section class="experiment-entry"><figure><img src="new.jpg" alt="New photo"></figure></section>'));
  const html = renderReflections(pages);
  assert.match(html, /Image group 2\/4/);
  assert.match(html, /Image group 4\/4/);
  assert.doesNotMatch(html, /Image group 1\/4|Image group 3\/4|Image group [13]\/3/);
});

test("editing a source reflection automatically changes the reading view", () => {
  const pages = fixturePages();
  const before = renderReflections(pages);
  pages.set("experiment-1.html", pages.get("experiment-1.html").replace("Third group&#x27;s reflection.", "An updated reflection with <em>new words</em>."));
  const after = renderReflections(pages);
  assert.ok(before.includes("Third group&#x27;s reflection."));
  assert.doesNotMatch(after, /Third group&#x27;s reflection\./);
  assert.ok(after.includes("An updated reflection with <em>new words</em>."));
});

test("publication embeds the complete reading view in its slot before browser JavaScript runs", () => {
  const pages = fixturePages();
  const template = '<main><h1>Reflections</h1><div data-reflections></div><p>After the reading view.</p></main>';
  const html = embedReflections(template, pages);
  assert.match(html, /\bdata-reflections-rendered\b/);
  assert.ok(html.includes(renderReflections(pages)));
  assert.ok(html.startsWith('<main><h1>Reflections</h1>'));
  assert.ok(html.endsWith('<p>After the reading view.</p></main>'));
  assert.equal(template, '<main><h1>Reflections</h1><div data-reflections></div><p>After the reading view.</p></main>');
  assert.equal(embedReflections('<main><p>No reflection slot here.</p></main>', pages), '<main><p>No reflection slot here.</p></main>');
});

function browserView(hash, embedded = false) {
  const pages = realPages(), pending = [], requests = [], events = [], errors = [], scrolled = [];
  let html = embedded ? renderReflections(pages) : "", text = "";
  const slot = {
    get innerHTML() { return html; },
    set innerHTML(value) { html = value; text = ""; events.push("render"); },
    get textContent() { return html ? html.replace(/<[^>]*>/g, "") : text; },
    set textContent(value) { text = value; html = ""; events.push("text"); }
  };
  vm.runInNewContext(fs.readFileSync(path.join(project, "reflections.js"), "utf8"), {
    location: { hash }, console: { error: error => errors.push(error) },
    document: {
      querySelector: () => embedded ? null : slot,
      getElementById(id) {
        return html.includes(`id="${id}"`) ? { scrollIntoView() { events.push("scroll"); scrolled.push(id); } } : null;
      }
    },
    fetch(page) {
      requests.push(page);
      return new Promise(resolve => pending.push(() => resolve({ ok: true, text: async () => pages.get(page) })));
    }
  });
  return { slot, requests, events, errors, scrolled, async finish() {
    for (const resolve of pending) resolve();
    await new Promise(setImmediate);
  } };
}

test("a direct reflection link waits for fetched content before scrolling to its image-group heading", async () => {
  const target = "experiment-2-part-2-group-7";
  for (const hash of [`#${target}`, "#experiment-2-part-2-group-%37"]) {
    const view = browserView(hash);
    assert.equal(view.slot.textContent, "Loading reflections…");
    assert.deepEqual(view.scrolled, []);
    await view.finish();
    assert.deepEqual(view.requests, REFLECTION_PAGES);
    assert.deepEqual(view.scrolled, [target]);
    assert.ok(view.events.indexOf("render") < view.events.indexOf("scroll"));
    assert.ok(view.slot.innerHTML.includes("<strong>Some of the more complex photos,</strong>"));
    assert.deepEqual(view.errors, []);
  }
});

test("empty, missing and malformed fragments leave the complete reading view available", async () => {
  const expected = renderReflections(realPages());
  for (const hash of ["", "#", "#missing-reflection", "#%E0%A4%A"]) {
    const view = browserView(hash);
    await view.finish();
    assert.equal(view.slot.innerHTML, expected);
    assert.doesNotMatch(view.slot.textContent, /Loading reflections|Reflections could not be loaded/);
    assert.deepEqual(view.scrolled, []);
    assert.deepEqual(view.errors, []);
  }
});

test("pre-embedded published reflections remain untouched by the browser loader", async () => {
  const view = browserView("#experiment-2-part-2-group-7", true);
  await view.finish();
  assert.equal(view.slot.innerHTML, renderReflections(realPages()));
  assert.deepEqual(view.requests, []);
  assert.deepEqual(view.events, []);
  assert.deepEqual(view.errors, []);
});
