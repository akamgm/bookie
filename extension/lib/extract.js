(function (root) {
  "use strict";

  function clean(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }

  function isbn(value) {
    const normalized = clean(value).replace(/[^0-9X]/gi, "").toUpperCase();
    return normalized.length === 10 || normalized.length === 13 ? normalized : "";
  }

  function values(value) {
    if (Array.isArray(value)) return value.flatMap(values);
    if (value && typeof value === "object") {
      return [clean(value.name || value.title)].filter(Boolean);
    }
    return [clean(value)].filter(Boolean);
  }

  function jsonLdObjects(document) {
    const objects = [];
    for (const element of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const parsed = JSON.parse(element.textContent || "");
        const queue = Array.isArray(parsed) ? parsed.slice() : [parsed];
        while (queue.length) {
          const item = queue.shift();
          if (!item || typeof item !== "object") continue;
          objects.push(item);
          if (Array.isArray(item["@graph"])) queue.push(...item["@graph"]);
        }
      } catch {
        // One malformed publisher script should not hide usable page metadata.
      }
    }
    return objects;
  }

  function isBookObject(item) {
    const types = values(item && item["@type"]).map((value) => value.toLowerCase());
    return types.some((type) => type === "book" || type === "product");
  }

  function text(document, selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const value = clean(element && (element.textContent || element.getAttribute("content")));
      if (value) return value;
    }
    return "";
  }

  function attr(document, selectors, attribute) {
    for (const selector of selectors) {
      const value = clean(document.querySelector(selector)?.getAttribute(attribute));
      if (value) return value;
    }
    return "";
  }

  function labeledDetails(document) {
    const details = {};
    const rows = document.querySelectorAll(
      "#detailBullets_feature_div li, #productDetails_detailBullets_sections1 tr, " +
        "#productDetails_techSpec_section_1 tr",
    );
    for (const row of rows) {
      const label = clean(
        row.querySelector(".a-text-bold, th")?.textContent || row.textContent?.split(":")[0],
      )
        .replace(/[:\u200e\u200f]/g, "")
        .toLowerCase();
      const rowText = clean(row.textContent).replace(/[\u200e\u200f]/g, "");
      const value = clean(
        row.querySelector("td")?.textContent ||
          rowText.slice(Math.max(0, rowText.indexOf(":") + 1)),
      );
      if (label && value) details[label] = value;
    }
    return details;
  }

  function firstDetail(details, name) {
    const key = Object.keys(details).find((candidate) => candidate.includes(name));
    return key ? details[key] : "";
  }

  function extract(document, location) {
    const structured = jsonLdObjects(document).find(isBookObject) || {};
    const details = labeledDetails(document);
    const title = clean(
      structured.name ||
        text(document, ["#productTitle", "h1", 'meta[property="og:title"]']),
    );
    const domAuthors = Array.from(
      document.querySelectorAll(
        "#bylineInfo .author a, #bylineInfo a.contrib, .authorName, [itemprop='author']",
      ),
      (element) => clean(element.textContent),
    ).filter(Boolean);
    const authors = Array.from(
      new Set([...values(structured.author), ...domAuthors]),
    ).slice(0, 20);

    let isbn10 = isbn(
      structured.isbn ||
        structured.isbn10 ||
        firstDetail(details, "isbn-10"),
    );
    const isbn13 = isbn(structured.isbn13 || firstDetail(details, "isbn-13"));
    const asin = isbn(firstDetail(details, "asin"));
    if (!isbn10 && asin.length === 10 && !asin.startsWith("B")) isbn10 = asin;

    const pageValue = firstDetail(details, "print length") || firstDetail(details, "pages");
    const pageMatch = pageValue.match(/\d[\d,]*/);
    const imageValue = Array.isArray(structured.image)
      ? structured.image[0]
      : structured.image?.url || structured.image;

    return {
      title,
      authors,
      isbn10: isbn10 || undefined,
      isbn13: isbn13 || undefined,
      coverUrl:
        clean(imageValue) ||
        attr(document, ["#landingImage", "#imgBlkFront", 'meta[property="og:image"]'], "src") ||
        attr(document, ['meta[property="og:image"]'], "content") ||
        undefined,
      publisher: firstDetail(details, "publisher") || undefined,
      pageCount: pageMatch ? Number(pageMatch[0].replace(/,/g, "")) : undefined,
      sourceUrl: String(location && location.href ? location.href : ""),
    };
  }

  root.BookieExtractor = { clean, extract, isbn };
})(globalThis);
