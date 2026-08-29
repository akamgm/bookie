"use strict";

const elements = {
  add: document.querySelector("#add"),
  authors: document.querySelector("#authors"),
  book: document.querySelector("#book"),
  cover: document.querySelector("#cover"),
  endpoint: document.querySelector("#endpoint"),
  identifier: document.querySelector("#identifier"),
  pageStatus: document.querySelector("#page-status"),
  result: document.querySelector("#result"),
  save: document.querySelector("#save"),
  settings: document.querySelector("#settings"),
  shelf: document.querySelector("#shelf"),
  title: document.querySelector("#title"),
  token: document.querySelector("#token"),
};

let extractedBook = null;
let configured = false;

function showResult(message, kind) {
  elements.result.textContent = message;
  elements.result.className = kind || "";
}

function updateAddState() {
  elements.add.disabled = !configured || !extractedBook?.title;
}

function currentEndpoint(value) {
  try {
    const endpoint = new URL(value);
    if (/^\/_\/i\/[^/]+\/bookie\/api\/books\/?$/.test(endpoint.pathname)) {
      endpoint.pathname = "/bookie/api/books";
      endpoint.search = "";
      endpoint.hash = "";
    }
    return endpoint.href;
  } catch {
    return value;
  }
}

async function loadSettings() {
  const values = await chrome.storage.local.get([
    "endpoint",
    "endpointDraft",
    "token",
    "tokenDraft",
    "shelf",
  ]);
  const hasEndpointDraft = Object.prototype.hasOwnProperty.call(values, "endpointDraft");
  const hasTokenDraft = Object.prototype.hasOwnProperty.call(values, "tokenDraft");
  const savedEndpoint = currentEndpoint(values.endpoint || "");
  const endpointDraft = currentEndpoint(values.endpointDraft || "");
  elements.endpoint.value = hasEndpointDraft ? endpointDraft : savedEndpoint;
  elements.token.value = hasTokenDraft ? values.tokenDraft : values.token || "";
  elements.shelf.value = values.shelf || "want";
  const migrations = {};
  if (savedEndpoint !== (values.endpoint || "")) migrations.endpoint = savedEndpoint;
  if (hasEndpointDraft && endpointDraft !== values.endpointDraft) {
    migrations.endpointDraft = endpointDraft;
  }
  if (Object.keys(migrations).length > 0) await chrome.storage.local.set(migrations);
  configured = Boolean(savedEndpoint && values.token);
  elements.settings.open = !configured;
  updateAddState();
}

async function extractPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url || "")) {
    elements.pageStatus.textContent = "Open a book page to add it.";
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["lib/extract.js"],
    });
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => globalThis.BookieExtractor.extract(document, location),
    });
    extractedBook = result?.result || null;
  } catch {
    elements.pageStatus.textContent = "Chrome would not allow access to this page.";
    return;
  }

  if (!extractedBook?.title) {
    elements.pageStatus.textContent = "This does not look like a supported book page.";
    return;
  }

  elements.pageStatus.textContent = "Book found on this page";
  elements.title.textContent = extractedBook.title;
  elements.authors.textContent = extractedBook.authors?.join(", ") || "Author unavailable";
  elements.identifier.textContent = extractedBook.isbn13 || extractedBook.isbn10 || "";
  if (extractedBook.coverUrl) {
    elements.cover.src = extractedBook.coverUrl;
    elements.cover.alt = `Cover of ${extractedBook.title}`;
    elements.cover.hidden = false;
  }
  elements.book.hidden = false;
  updateAddState();
}

elements.save.addEventListener("click", async () => {
  showResult("");
  try {
    const endpoint = new URL(currentEndpoint(elements.endpoint.value.trim()));
    if (endpoint.protocol !== "https:") throw new Error("The endpoint must use HTTPS.");
    const token = elements.token.value.trim();
    if (!token.startsWith("bookie_")) throw new Error("Paste a Bookie extension token.");

    const originPattern = `${endpoint.origin}/*`;
    const granted = await chrome.permissions.request({ origins: [originPattern] });
    if (!granted) throw new Error("Bookie needs permission to contact this Quiver.");

    await chrome.storage.local.set({
      endpoint: endpoint.href,
      token,
      shelf: elements.shelf.value,
    });
    await chrome.storage.local.remove(["endpointDraft", "tokenDraft"]);
    configured = true;
    elements.settings.open = false;
    updateAddState();
    showResult("Connection saved.", "success");
  } catch (error) {
    showResult(error.message || "Could not save the connection.", "error");
  }
});

elements.endpoint.addEventListener("input", () => {
  chrome.storage.local.set({ endpointDraft: elements.endpoint.value });
});

elements.token.addEventListener("input", () => {
  chrome.storage.local.set({ tokenDraft: elements.token.value });
});

elements.shelf.addEventListener("change", () => {
  chrome.storage.local.set({ shelf: elements.shelf.value });
});

elements.add.addEventListener("click", async () => {
  elements.add.disabled = true;
  elements.add.textContent = "Adding…";
  showResult("");
  try {
    const settings = await chrome.storage.local.get(["endpoint", "token"]);
    const response = await fetch(settings.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...extractedBook, status: elements.shelf.value }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Bookie returned ${response.status}.`);
    showResult(
      `Sent “${payload.book.title}” to Bookie. It will appear while Bookie is open.`,
      "success",
    );
    elements.add.textContent = "Sent";
  } catch (error) {
    showResult(error.message || "Could not add this book.", "error");
    elements.add.textContent = "Try again";
    updateAddState();
  }
});

void Promise.all([loadSettings(), extractPage()]);
