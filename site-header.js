(() => {
  "use strict";

  function siteNameFromTemplate(template) {
    const name = template.match(/<a\b[^>]*\bdata-site-name\b[^>]*>([^<]*)<\/a\s*>/i)?.[1].trim();
    if (!name) throw new Error("The shared header needs a plain-text site name in its data-site-name link.");
    return name;
  }

  function renderSiteHeader(template, { page, showExperiments = false }) {
    siteNameFromTemplate(template);
    let html = template.replace(/<nav\b(?=[^>]*\bdata-experiment-navigation\b)[^>]*>[\s\S]*?<\/nav\s*>/gi, (nav) => {
      if (!showExperiments) return "";
      return nav.replace(/<a\b([^>]*)>/gi, (_, attributes) => {
        const target = attributes.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
        const clean = attributes.replace(/\s+aria-current\s*=\s*(["']).*?\1/gi, "");
        return `<a${clean}${target === page ? ' aria-current="page"' : ""}>`;
      });
    });
    if (page === "index.html") {
      html = html.replace(/<a\b[^>]*\bdata-site-name\b[^>]*>[^<]*<\/a\s*>/i, "<h1>$&</h1>");
    }
    return html.trim();
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { renderSiteHeader, siteNameFromTemplate };
    return;
  }

  const slots = [...document.querySelectorAll("[data-site-header]")]
    .filter(slot => !slot.hasAttribute("data-site-header-rendered"));
  if (!slots.length) return;

  // Publication embeds the header; Live Server loads the same editable template.
  const templateUrl = new URL("includes/site-header.html", document.currentScript.src);
  async function loadHeader() {
    const response = await fetch(templateUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load the shared header (${response.status}).`);
    const template = await response.text();
    const page = location.pathname.split("/").pop() || "index.html";
    for (const slot of slots) {
      slot.innerHTML = renderSiteHeader(template, {
        page,
        showExperiments: slot.getAttribute("data-site-header") === "experiments"
      });
    }
    const name = slots[0].querySelector("[data-site-name]").textContent.trim();
    for (const element of document.querySelectorAll("title[data-site-name], meta[data-site-name]")) {
      if (element.tagName === "META") element.setAttribute("content", name);
      else element.textContent = name;
    }
  }

  loadHeader().catch(error => console.error(error));
})();
