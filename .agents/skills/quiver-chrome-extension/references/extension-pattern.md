# Manifest V3 extension pattern

## Minimal layout

```text
extension/
  manifest.json
  popup.html
  popup.css
  popup.js
  lib/
    extract.js
  tests/
    extract.test.ts
```

Omit icon declarations unless every referenced icon exists at the exact
declared size.

## Manifest

```json
{
  "manifest_version": 3,
  "name": "Send to My Quiver App",
  "version": "0.1.0",
  "permissions": ["activeTab", "scripting", "storage"],
  "optional_host_permissions": ["https://*/*"],
  "action": {
    "default_popup": "popup.html"
  }
}
```

`activeTab` and `scripting` allow extraction only after the member invokes the
extension. Optional host permissions avoid permanent access to every HTTPS
site merely because the Quiver endpoint can use a custom host.

## On-demand extraction

```js
const [tab] = await chrome.tabs.query({
  active: true,
  currentWindow: true,
});

await chrome.scripting.executeScript({
  target: { tabId: tab.id },
  files: ["lib/extract.js"],
});

const [result] = await chrome.scripting.executeScript({
  target: { tabId: tab.id },
  func: () => globalThis.MyExtractor.extract(document, location),
});
```

The extractor should install one stable global and otherwise avoid page-global
side effects. Content scripts run in an isolated world.

## Structured metadata

Walk all `script[type="application/ld+json"]` blocks. Support:

- a single object
- a top-level array
- `@graph`
- `Book` and relevant `Product` objects
- author as a string, object, or array
- image as a string, object, or array

Catch malformed blocks individually. Add site-specific selectors only for
missing fields. Normalize whitespace and ISBN punctuation, but let the backend
make the canonical match.

## Draft persistence

Chrome closes popups when focus moves away. Preserve drafts immediately:

```js
endpoint.addEventListener("input", () => {
  chrome.storage.local.set({ endpointDraft: endpoint.value });
});

token.addEventListener("input", () => {
  chrome.storage.local.set({ tokenDraft: token.value });
});
```

Distinguish an absent key from an empty draft:

```js
const hasDraft = Object.prototype.hasOwnProperty.call(values, "endpointDraft");
endpoint.value = hasDraft ? values.endpointDraft : values.endpoint || "";
```

On successful save:

```js
await chrome.storage.local.set({ endpoint: normalizedEndpoint, token });
await chrome.storage.local.remove(["endpointDraft", "tokenDraft"]);
```

## Request only the configured origin

Permission requests must happen during a user gesture:

```js
const endpoint = new URL(endpointInput.value.trim());
if (endpoint.protocol !== "https:") throw new Error("HTTPS is required.");

const granted = await chrome.permissions.request({
  origins: [`${endpoint.origin}/*`],
});
if (!granted) throw new Error("Permission was not granted.");
```

Then send:

```js
const response = await fetch(endpoint.href, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(extracted),
});
```

Parse JSON defensively and display the server's `error` value. Use queued/sent
language for `202`.

## Packaging

Stage runtime files into a temporary directory:

```sh
PACKAGE_DIR="$DELTA_SCRATCH_DIR/my-extension"
mkdir -p "$PACKAGE_DIR/lib"
cp extension/manifest.json extension/popup.html \
  extension/popup.css extension/popup.js "$PACKAGE_DIR/"
cp extension/lib/extract.js "$PACKAGE_DIR/lib/"
```

Pack with Chrome on macOS:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --pack-extension="$PACKAGE_DIR" \
  --no-message-box
```

This writes sibling `.crx` and `.pem` files. Never copy the `.pem` into the
repository or distribution.

Create the Load-unpacked ZIP from inside the staged directory so it expands
with `manifest.json` at its root:

```sh
(
  cd "$PACKAGE_DIR"
  zip -9 -r /absolute/output/my-extension.zip .
)
```

Print checksums:

```sh
shasum -a 256 /absolute/output/my-extension.crx \
  /absolute/output/my-extension.zip
```
