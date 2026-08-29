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

  const SITE_PROFILES = [
    {
      hosts: ["goodreads.com"],
      title: ['h1[data-testid="bookTitle"]', "h1.Text"],
      authors: ['[data-testid="name"]', ".ContributorLink__name"],
      cover: [".BookCover__image img"],
    },
    {
      hosts: ["thestorygraph.com"],
      title: [".book-title-author-and-series h3", ".book-title h1", "main h1"],
      authors: [".book-title-author-and-series .author", 'a[href*="/authors/"]'],
      cover: [".book-cover img", 'img[alt*="cover"]'],
    },
    {
      hosts: ["literal.club"],
      title: ["main h1"],
      authors: ['main a[href*="/author/"]', 'main a[href*="/authors/"]'],
      cover: ['main img[alt*="cover"]'],
    },
    {
      hosts: ["barnesandnoble.com"],
      title: ["h1.pdp-header-title", ".pdp-header-title"],
      authors: [".contributors a", ".pdp-header-author a"],
      cover: [".pdp-image-container img", "#pdpMainImage"],
    },
    {
      hosts: ["bookshop.org"],
      title: [".product-title", "main h1"],
      authors: [".product-author a", 'main a[href*="/contributors/"]'],
      cover: [".product-image img", ".product__image img"],
    },
    {
      hosts: ["kobo.com"],
      title: ['[data-testid="title"]', ".title-widget h1", "main h1"],
      authors: ['[data-testid="author-name"]', ".contributor-name"],
      cover: [".cover-image", ".book-cover img"],
    },
    {
      hosts: ["books.google.com", "play.google.com"],
      title: ["h1", ".AHFaub"],
      authors: ['a[href*="inauthor"]', ".hAyfc a"],
      cover: ["#summary-frontcover", ".T75of"],
    },
    {
      hosts: ["waterstones.com"],
      title: [".book-title", "main h1"],
      authors: [".book-info__author a"],
      cover: [".book-image img"],
    },
    {
      hosts: ["abebooks.com"],
      title: ["#book-title", "main h1"],
      authors: ["#book-author a", ".author a"],
      cover: ["#book-image img", ".book-image img"],
    },
  ];

  function siteProfile(hostname) {
    const host = clean(hostname).toLowerCase().replace(/^www\./, "");
    return SITE_PROFILES.find((profile) =>
      profile.hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`)),
    );
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

  function attrs(document, selectors, attribute) {
    return selectors.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector), (element) =>
        clean(element.getAttribute(attribute)),
      ).filter(Boolean),
    );
  }

  function elementImage(element) {
    if (!element) return "";
    return clean(
      element.getAttribute("src") ||
        element.getAttribute("data-src") ||
        element.getAttribute("data-original") ||
        element.getAttribute("content"),
    );
  }

  function labeledDetails(document) {
    const details = {};
    const rows = document.querySelectorAll(
      "#detailBullets_feature_div li, #productDetails_detailBullets_sections1 tr, " +
        "#productDetails_techSpec_section_1 tr, .product-details tr, " +
        ".product-details-list li, .book-details tr",
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
    for (const labelElement of document.querySelectorAll("main dt, .product-details dt")) {
      const label = clean(labelElement.textContent).replace(/[:\u200e\u200f]/g, "").toLowerCase();
      const value = clean(labelElement.nextElementSibling?.textContent);
      if (label && value) details[label] = value;
    }
    return details;
  }

  function firstDetail(details, name) {
    const key = Object.keys(details).find((candidate) => candidate.includes(name));
    return key ? details[key] : "";
  }

  function splitIsbns(candidates) {
    let isbn10 = "";
    let isbn13 = "";
    for (const candidate of candidates) {
      const normalized = isbn(candidate);
      if (normalized.length === 13 && !isbn13) isbn13 = normalized;
      if (normalized.length === 10 && !isbn10) isbn10 = normalized;
    }
    return { isbn10, isbn13 };
  }

  function extract(document, location) {
    const structured = jsonLdObjects(document).find(isBookObject) || {};
    const details = labeledDetails(document);
    const profile = siteProfile(location && location.hostname);
    const title = clean(
      structured.name ||
        text(document, [
          ...(profile?.title || []),
          "#productTitle",
          'meta[name="citation_title"]',
          'meta[property="og:title"]',
          "main h1",
          "h1",
        ]),
    );
    const domAuthors = Array.from(
      document.querySelectorAll(
        [
          ...(profile?.authors || []),
          "#bylineInfo .author a",
          "#bylineInfo a.contrib",
          ".authorName",
          "[itemprop='author']",
        ].join(", "),
      ),
      (element) => clean(element.textContent),
    ).filter(Boolean);
    const authors = Array.from(
      new Set([
        ...values(structured.author || structured.creator),
        ...attrs(document, ['meta[name="citation_author"]'], "content"),
        ...domAuthors,
      ]),
    ).slice(0, 20);

    const identifiers = splitIsbns([
      ...values(structured.isbn),
      structured.isbn10,
      structured.isbn13,
      ...attrs(
        document,
        [
          'meta[property="books:isbn"]',
          'meta[property="product:isbn"]',
          'meta[name="citation_isbn"]',
          '[itemprop="isbn"]',
        ],
        "content",
      ),
      text(document, ['[itemprop="isbn"]']),
      firstDetail(details, "isbn-10"),
      firstDetail(details, "isbn-13"),
    ]);
    let isbn10 = identifiers.isbn10;
    const isbn13 = identifiers.isbn13;
    const asin = isbn(firstDetail(details, "asin"));
    if (!isbn10 && asin.length === 10 && !asin.startsWith("B")) isbn10 = asin;

    const pageValue = clean(
      structured.numberOfPages ||
        firstDetail(details, "print length") ||
        firstDetail(details, "page count") ||
        firstDetail(details, "pages"),
    );
    const pageMatch = pageValue.match(/\d[\d,]*/);
    const structuredImage = Array.isArray(structured.image)
      ? structured.image[0]
      : structured.image;
    const imageValue =
      structuredImage?.url || structuredImage?.contentUrl || structuredImage;
    const profileCover = (profile?.cover || [])
      .map((selector) => elementImage(document.querySelector(selector)))
      .find(Boolean);
    const publisher = values(structured.publisher)[0] || firstDetail(details, "publisher");

    return {
      title,
      authors,
      isbn10: isbn10 || undefined,
      isbn13: isbn13 || undefined,
      coverUrl:
        clean(imageValue) ||
        profileCover ||
        attr(document, ["#landingImage", "#imgBlkFront"], "src") ||
        attr(document, ['meta[property="og:image"]'], "content") ||
        undefined,
      publisher: publisher || undefined,
      pageCount: pageMatch ? Number(pageMatch[0].replace(/,/g, "")) : undefined,
      sourceUrl: String(location && location.href ? location.href : ""),
    };
  }

  root.BookieExtractor = { clean, extract, isbn, siteProfile, splitIsbns };
})(globalThis);
