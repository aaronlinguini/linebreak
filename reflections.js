(() => {
  "use strict";

  const REFLECTION_PAGES = Object.freeze([
    "experiment-1.html", "experiment-2-part-1.html", "experiment-2-part-2.html", "experiment-3.html"
  ]);

  // Keep source offsets so paragraphs and inline emphasis are copied unchanged.
  function readBlocks(html) {
    const source = html.replace(/<!--[\s\S]*?-->/g, "");
    const blocks = [];
    const stack = [];
    const tags = /<(\/?)([a-z][\w:-]*)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
    for (const match of source.matchAll(tags)) {
      const tag = match[2].toLowerCase();
      if (match[1]) {
        const block = stack.pop();
        if (!block || block.tag !== tag) throw new Error(`Unbalanced reflection source near </${tag}>.`);
        block.contentEnd = match.index;
      } else {
        const classes = match[0].match(/\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
        const block = { tag, classes: (classes?.[1] ?? classes?.[2] ?? "").split(/\s+/),
          contentStart: match.index + match[0].length, contentEnd: match.index + match[0].length };
        blocks.push(block);
        if (!/^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(tag)
          && !/\/\s*>$/.test(match[0])) stack.push(block);
      }
    }
    if (stack.length) throw new Error("Unclosed element in reflection source.");
    return { source, blocks };
  }

  function hasText(html) {
    return Boolean(html.replace(/<[^>]*>/g, "").replace(/&(?:nbsp|#160|#x0*a0);/gi, " ").trim());
  }

  function renderReflections(pages) {
    const sections = [];
    const links = [];
    for (const page of REFLECTION_PAGES) {
      const html = pages.get(page);
      if (typeof html !== "string") throw new Error(`Missing reflection source: ${page}`);
      const { source, blocks } = readBlocks(html);
      const inner = block => source.slice(block.contentStart, block.contentEnd).trim();
      const title = blocks.find(block => block.tag === "title");
      const introduction = blocks.find(block => block.classes.includes("experiment-introduction"));
      if (!title || !introduction) throw new Error(`${page} needs a title and main reflection.`);
      const label = inner(title);
      const id = page.replace(/\.html$/, "");
      const entries = blocks.filter(block => block.classes.includes("experiment-entry"));
      const notes = entries.flatMap((entry, index) => {
        const reflections = blocks.filter(block => block.contentStart > entry.contentStart
          && block.contentEnd < entry.contentEnd
          && block.classes.some(name => name === "experiment-photo-note" || name === "experiment-reflection"))
          .map(inner).filter(hasText);
        if (!reflections.length) return [];
        return [`<section aria-labelledby="${id}-group-${index + 1}">
          <h3 id="${id}-group-${index + 1}">Image group ${index + 1}/${entries.length}</h3>
          ${reflections.join("\n")}
        </section>`];
      });
      const mainReflection = inner(introduction)
        .replace(/<(\/?)h([1-5])\b/gi, (_, close, rank) => `<${close}h${Number(rank) + 1}`)
        .replace(/\bid="([^"]+)"/g, (_, value) => `id="${id}-${value}"`);
      links.push(`<li><a href="#${id}">${label}</a></li>`);
      sections.push(`<section class="reflection-experiment" id="${id}" aria-labelledby="${id}-heading">
        <h2 id="${id}-heading">${label}</h2>
        <p><a href="${page}">View gallery</a></p>
        ${mainReflection}
        ${notes.join("\n")}
      </section>`);
    }
    return `<nav class="reflections-contents" aria-label="Reflections contents"><ul>${links.join("\n")}</ul></nav>
      ${sections.join("\n")}`;
  }

  function embedReflections(template, pages) {
    return template.replace(/<div data-reflections><\/div>/g,
      () => `<div data-reflections data-reflections-rendered>${renderReflections(pages)}</div>`);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { REFLECTION_PAGES, renderReflections, embedReflections };
    return;
  }

  const slot = document.querySelector("[data-reflections]:not([data-reflections-rendered])");
  if (!slot) return;
  slot.textContent = "Loading reflections…";
  async function loadReflections() {
    const pages = await Promise.all(REFLECTION_PAGES.map(async page => {
      const response = await fetch(page, { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not load ${page} (${response.status}).`);
      return [page, await response.text()];
    }));
    slot.innerHTML = renderReflections(new Map(pages));
  }
  loadReflections().catch(error => {
    slot.textContent = "Reflections could not be loaded. Please reload this page.";
    console.error(error);
  });
})();
