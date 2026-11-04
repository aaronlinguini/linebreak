"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { renderSiteHeader } = require("../site-header.js");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "experiment-carousel.js"), "utf8");

function layoutHarness({ headerLoaded = true } = {}) {
  const frames = new Map(), listeners = new Map(), observers = [], focusCalls = [];
  let frameId = 0, introTop = 100;
  const document = { activeElement: null };
  function node(tag, className = "") {
    const element = {
      tagName: tag.toUpperCase(), className, children: [], parentElement: null,
      contains(target) { return target === this || this.children.some(child => child.contains(target)); },
      append(child) { move(child, this, this.children.length); },
      prepend(child) { move(child, this, 0); },
      before(child) { move(child, this.parentElement, this.parentElement.children.indexOf(this)); },
      focus(options) { document.activeElement = this; focusCalls.push({ node: this, options }); }
    };
    return element;
  }
  function move(child, parent, index) {
    if (child.parentElement) {
      if (child.contains(document.activeElement)) document.activeElement = null;
      const siblings = child.parentElement.children;
      siblings.splice(siblings.indexOf(child), 1);
    }
    parent.children.splice(index, 0, child);
    child.parentElement = parent;
  }
  const header = node("header"), navigation = node("nav"), heading = node("h1");
  const layout = node("main"), gallery = node("div"), introduction = node("section");
  const introHeading = node("h2"), paragraph = node("p"), reference = node("span"), link = node("a");
  header.append(navigation); header.append(heading);
  layout.append(gallery); layout.append(introduction);
  introduction.append(introHeading); introduction.append(paragraph); reference.append(link);
  if (headerLoaded) navigation.append(reference);
  gallery.getBoundingClientRect = () => ({ top: 100, bottom: 700 });
  introduction.getBoundingClientRect = () => ({ top: introTop });
  layout.querySelector = selector => selector.includes("experiment-gallery") ? gallery
    : selector.includes("experiment-introduction") ? introduction : null;
  document.querySelector = selector => selector === "[data-carousel]" ? null : selector === ".experiment-layout" ? layout
    : selector === ".site-header > h1" ? header.children.find(child => child === heading) || null
      : selector === "[data-reflections-reference]" && headerLoaded ? reference : null;
  document.createElement = tag => node(tag);
  document.addEventListener = (name, callback, options) => listeners.set(name, { callback, once: options?.once });
  vm.runInNewContext(source, {
    document,
    requestAnimationFrame(callback) { const id = ++frameId; frames.set(id, callback); return id; },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; this.elements = new Set(); observers.push(this); }
      observe(element) { this.elements.add(element); }
    }
  });
  return { document, header, heading, introduction, introHeading, paragraph, reference, link, frames, focusCalls,
    titleRow: () => header.children.find(child => child.className.split(/\s+/).includes("experiment-title-row")),
    flush() { const callbacks = [...frames.values()]; frames.clear(); for (const callback of callbacks) callback(); },
    wrap(stacked) {
      introTop = stacked ? 740 : 100;
      for (const observer of observers) if (observer.elements.has(layout)) observer.callback();
    },
    loadHeader() {
      headerLoaded = true;
      navigation.append(reference);
      const listener = listeners.get("site-header-ready");
      if (listener?.once) listeners.delete("site-header-ready");
      listener?.callback();
    }
  };
}

test("one reference follows actual gallery wrapping while preserving its heading, existing prose and keyboard focus", () => {
  const h = layoutHarness();
  h.document.activeElement = h.link;
  h.wrap(false); h.wrap(false);
  assert.equal(h.frames.size, 1, "resize notifications share one pending measurement");
  h.flush();
  const row = h.titleRow();
  assert.deepEqual(row.children, [h.heading, h.reference]);
  assert.equal(h.document.activeElement, h.link);
  h.wrap(true); h.flush();
  assert.deepEqual(h.introduction.children, [h.reference, h.introHeading, h.paragraph]);
  assert.deepEqual(row.children, [h.heading]);
  assert.equal(h.document.activeElement, h.link);
  h.wrap(false); h.flush();
  assert.strictEqual(h.titleRow(), row);
  assert.deepEqual(row.children, [h.heading, h.reference]);
  assert.deepEqual(h.introduction.children, [h.introHeading, h.paragraph]);
  assert.equal(h.document.activeElement, h.link);
  assert.equal(h.focusCalls.length, 3);
  assert.ok(h.focusCalls.every(call => call.node === h.link && call.options.preventScroll === true));
  h.wrap(false); h.flush();
  assert.equal(h.focusCalls.length, 3, "unchanged layout does not move or refocus the reference");
});

test("the local asynchronous header supplies the same existing reference after initial layout setup", () => {
  const h = layoutHarness({ headerLoaded: false });
  assert.equal(h.titleRow(), undefined);
  assert.equal(h.frames.size, 0);
  h.loadHeader(); h.flush();
  assert.deepEqual(h.titleRow().children, [h.heading, h.reference]);
  h.wrap(true); h.flush();
  assert.deepEqual(h.introduction.children, [h.reference, h.introHeading, h.paragraph]);
});

test("only Part2 receives the requested header notice and its text-view destination", () => {
  const template = fs.readFileSync(path.join(root, "includes/site-header.html"), "utf8");
  for (const page of ["experiment-1.html", "experiment-2-part-1.html", "experiment-2-part-2.html", "experiment-3.html"]) {
    const html = renderSiteHeader(template, { page, showExperiments: true });
    if (page !== "experiment-2-part-2.html") {
      assert.doesNotMatch(html, /\bdata-reflections-reference\b|\bdata-reflections-link\b/);
      continue;
    }
    const reference = html.match(/<span\b[^>]*\bdata-reflections-reference\b[^>]*>([\s\S]*?)<\/span>/)?.[1];
    assert.ok(reference, `${page}: one movable reference`);
    assert.equal((html.match(/\bdata-reflections-reference\b/g) || []).length, 1);
    const links = [...reference.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
    assert.equal(links.length, 1);
    assert.ok(links[0][1].includes(`href="reflections.html#${page.replace(/\.html$/, "")}"`));
    assert.equal(links[0][2], "here, in the text-only view");
    assert.ok(reference.slice(0, reference.indexOf("<a")).trim(), "the editable notice precedes the text-view link");
  }
});
