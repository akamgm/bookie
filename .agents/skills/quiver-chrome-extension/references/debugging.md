# Debugging Quiver extension integrations

Classify the failure before changing code.

## Startup errors

During `quiver dev`, open iframes can issue queries while the runtime component
is being replaced. Errors saying the app “is unavailable because its runtime
component is not active” are transient only when bracketed by:

```text
[build:rebuilding] app
...
[build:ready] app
```

Do not diagnose endpoint behavior until `[build:ready]`.

## Route probe

Probe the exact endpoint without a credential:

```sh
curl -i -sS -X POST "https://quiver.example/my-app/api/items" \
  -H "Content-Type: application/json" \
  --data '{"title":"Probe"}'
```

Expected: structured JSON `401`.

Interpret common responses:

- Plain `404 Not found` — wrong URL or missing route.
- `Unknown app "api"` — malformed canonical path, usually missing app ID.
- `No public route for POST ...` — route not registered, wrong method/path, or
  durable source is active instead of the live bridge.
- HTML `500` with `.channelId` validation and an installation handle value —
  mount-relative canonical dispatch is supplying the wrong identity. Use a
  pinned absolute route only when the endpoint does not need channel scope.
- JSON `401` — routing and handler request parsing work.

## Endpoint response matrix

- Generic browser `502` with no JSON body usually means an uncaught route or
  mutation failure.
- JSON `502` from the app means the canonical provider request failed.
- JSON `404` means the route worked but canonical matching rejected the page.
- JSON `500` after a match means queueing or claiming failed.
- JSON `202` means the public half succeeded; inspect the claim half next.

Make each boundary return a distinct message and log prefix:

```text
Extension provider lookup failed:
Extension import queue failed:
Failed to claim extension imports:
```

Do not return raw secrets, headers, provider response bodies, or database
records in diagnostics.

## Provider debugging

Exercise the existing provider action through Quiver RPC with the exact page
metadata:

```sh
mise exec -- quiver -c <channel> call \
  app.searchItems '{"query":"<isbn>"}' --json

mise exec -- quiver -c <channel> call \
  app.searchItems '{"query":"<title> <primary author>"}' --json
```

An edition may be absent by ISBN while another edition exists by title and
author. That should use the fallback matcher, not fail or trust page data.

## Claim debugging

Expose the claim mutation normally when it is safe for any member to call for
themselves. Because `caller` is bridge-injected, another app or member cannot
claim someone else's rows.

Test it over RPC:

```sh
mise exec -- quiver -c <channel> call \
  app.claimImports '{}' --json
```

Expected empty result:

```json
{"claimed":0,"remaining":0}
```

If a public action tries to call a member-scoped mutation and fails despite
passing `caller`, do not create a parallel quiver-scoped private library.
Introduce the addressed handoff and authenticated claim.

## Extension debugging

Use separate DevTools contexts:

- Popup: right-click the popup and inspect.
- Content script: page DevTools, Sources, Content scripts.
- Service worker, when present: `chrome://extensions` → Inspect views.

Check:

- The saved endpoint is complete and uses HTTPS.
- Old endpoint shapes were migrated.
- The optional host permission includes exactly the endpoint origin.
- Draft fields survive closing and reopening the popup.
- Extracted authors are an array, not one comma-joined string.
- ISBN direction marks and punctuation are removed.
- The response body is parsed before falling back to `returned <status>`.

After source changes, reload the unpacked extension from
`chrome://extensions`; changing files on disk does not reliably reload every
extension context.
