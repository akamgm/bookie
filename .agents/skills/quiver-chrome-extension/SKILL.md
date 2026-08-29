---
name: quiver-chrome-extension
description: Build, debug, test, and package Manifest V3 Chrome extensions that send page data to Quiver apps through authenticated public routes. Use for browser capture/import extensions, Quiver capability tokens, member-scoped handoffs, publicRoute APIs, popup persistence, unpacked testing, or CRX/ZIP packaging.
---

# Quiver Chrome Extension Development

Build the extension and Quiver endpoint as one integration. The browser is an
untrusted extractor; the Quiver backend authenticates, canonicalizes, and
applies app invariants.

This skill is a Quiver-specific overlay. For broad Chrome Web Store policy or
advanced MV3 architecture, also use a reputable general extension skill such
as `googlechrome/modern-web-guidance@chrome-extensions` when available.

## Start with current platform truth

Before editing:

1. Read the repository's `AGENTS.md` and relevant app documentation.
2. Run platform docs through the project's configured runtime:

   ```sh
   mise exec -- quiver docs intro
   mise exec -- quiver docs public-routes
   mise exec -- quiver docs caller
   mise exec -- quiver docs server
   ```

3. Inspect the app's manifest, schema, backend functions, settings UI, and the
   mutation that already performs the target operation.
4. Inspect a working same-quiver integration, such as Datebook, but check it
   against current docs. Older apps may use deprecated `external` declarations
   where new code should use `publicRoute`.
5. Run `mise exec -- quiver check` before changing anything.

Do not assume Bun is directly on `PATH`; use `mise exec -- bun ...`.

## Choose the data flow before writing code

### Public routes are anonymous

A `publicRoute` has no Quiver member session. Treat every request field,
including a claimed handle, as attacker-controlled.

- Never accept a member handle as authorization.
- Never accept canonical application IDs or privileged records from a page.
- Authenticate the request with an app-issued capability token.
- Store only a SHA-256 token hash, never the usable token.
- Keep tokens in extension-local storage and send them only over HTTPS.
- Make rotation invalidate old credentials.

### Member-scoped writes require an authenticated handoff

An anonymous public route cannot enter `.scope("member")`. Resolving a token
to a handle and passing it as `caller` to `ctx.runMutation` does **not** create
a trusted member context.

When the destination is member-scoped:

1. The route validates the token and canonicalizes input.
2. A server-only mutation writes a minimal addressed row to a
   `.scope("quiver")` handoff table.
3. The authenticated iframe calls a manifest-declared mutation with
   `caller: v.string()`.
4. That mutation reads only handoffs addressed to `caller`, applies the app's
   existing member-scoped helper, and deletes each successful handoff.
5. Claim immediately on mount, on visibility changes, and periodically while
   the app is open.

Bound and deduplicate the handoff table. It is transport, not a second source
of truth. Do not copy private notes, reviews, history, or other member data
into it.

For a direct quiver-scoped or channel-scoped webhook write, a handoff may not
be needed. Follow the target table's scope, not a one-size-fits-all recipe.

See [backend-pattern.md](references/backend-pattern.md) for the concrete
schema and function shape.

## Select the route shape deliberately

Prefer a mount-relative route when behavior belongs to one installation:

```ts
publicRoute: { method: "POST", path: "/api/items" }
```

Resolve it with `usePublicRoute({ path: "/api/items" })`. Never construct
canonical `/_/i/...` URLs.

Prefer a pinned absolute route when the integration is quiver-wide, uses only
quiver/member-handoff state, and needs one stable endpoint:

```ts
publicRoute: { method: "POST", absolutePath: "/my-app/api/items" }
```

An absolute route is a quiver-wide claim and can conflict with another app.
`usePublicRoute` intentionally does not resolve it. In a channel iframe,
derive only the public origin from the shell referrer:

```ts
new URL("/my-app/api/items", document.referrer).href
```

Probe the actual route after `[build:ready]`. On platform versions where a
mount-relative canonical route passes an installation handle as `channelId`,
use an absolute route only if the endpoint is genuinely quiver-wide and does
not need channel scope. Do not work around that failure by weakening table
scope.

## Keep external metadata untrusted

The content script should extract hints:

- title and subtitle
- authors/contributors
- ISBN-10 and ISBN-13
- cover URL
- publisher, page count, and source URL when available

Prefer Schema.org JSON-LD, then add site-specific selectors. One malformed
JSON-LD block must not suppress other metadata.

The backend should resolve those hints against its canonical provider:

1. Search by normalized ISBN.
2. If that edition is absent, search by title plus primary author.
3. Require an ISBN match or an exact normalized title with an author overlap.
4. Store the provider's canonical record, not arbitrary page metadata.
5. Use the app's existing upsert/helper so extension imports preserve
   deduplication, activity history, projections, and timestamps.

Keep third-party credentials server-scoped. Never put provider tokens in the
extension, iframe env, source, logs, or responses.

## Build a low-permission MV3 extension

Use Manifest V3. For a click-to-import extension:

- `activeTab` for the page selected by the user.
- `scripting` to inject the extractor on demand.
- `storage` for endpoint, token, shelf, and draft state.
- `optional_host_permissions: ["https://*/*"]`, then request only the
  configured Quiver origin during a user gesture.
- No background worker unless durable background behavior is actually needed.
- No remote JavaScript or inline scripts.

Keep extraction pure enough to unit test. Inject the extractor file, then
execute a small function that calls it in the page's isolated world.

### Popup state must survive focus changes

Chrome closes an extension popup as soon as the user switches to Quiver to
copy another value. Persist each configuration field on every `input` event:

- `endpointDraft`
- `tokenDraft`

On open, prefer a draft when the key exists, including an intentionally empty
draft. On successful save, promote both values and remove the draft keys.
Persist ordinary selections such as shelf status on `change`.

When an endpoint contract changes, migrate known old URL shapes during load
and save rather than requiring every installed copy to be reconfigured.

See [extension-pattern.md](references/extension-pattern.md) for file layout,
draft storage, host permission, and packaging examples.

## Return useful HTTP responses

Return plain serializable response objects if the current Quiver runtime
cannot serialize a fetch `Response`:

```ts
{
  status: 202,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify({ queued: true }),
}
```

Recommended status semantics:

- `202` — accepted into a member handoff queue.
- `400` — malformed or missing metadata.
- `401` — missing, malformed, rotated, or unknown token.
- `404` — no confident canonical match.
- `500` — internal queue/write failure.
- `502` — canonical provider unavailable or rejected the server request.

Do not claim “Added” when the server returned `202`. Say it was sent to
Quiver and will be claimed while the app is open or next opens.

Public-route handlers are also manifest-callable actions. Refuse calls without
the external `request` envelope.

## Validate in layers

Run static checks first:

```sh
mise exec -- quiver check
mise exec -- bun test extension/tests
mise exec -- bun build extension/popup.js extension/lib/extract.js \
  --target browser --outdir "$DELTA_SCRATCH_DIR/extension-build"
git diff --check
```

Then validate the real workflow:

1. Start `quiver dev`.
2. Ignore transient “runtime component is not active” errors only while
   `[build:rebuilding]` is displayed.
3. Wait for `[build:ready]`.
4. Probe the route without a token and require a structured JSON `401`.
5. Test canonical provider search over RPC with real extracted ISBN/title
   data.
6. Load the extension unpacked and test extraction on a live supported page.
7. Test endpoint and token entry across separate popup openings.
8. Submit an import and verify the handoff is claimed into the member shelf.
9. Verify duplicate imports update/upsert rather than create duplicate rows.
10. Check `mise exec -- quiver errors --app <app> --since 15m`.

Use [debugging.md](references/debugging.md) to classify failures before
changing architecture.

## Package safely

Package only runtime files, not tests, docs, `.DS_Store`, credentials, or
development output.

Produce both:

- A ZIP for **Load unpacked**; this is the reliable sharing format.
- A CRX when explicitly requested; ordinary Chrome often blocks CRX installs
  outside the Chrome Web Store.

Chrome generates a `.pem` signing key while packing. Treat it as a secret:

- Never commit or share it.
- Keep it outside the repository.
- Preserve it securely only if future CRX releases must retain one extension
  ID.

Print SHA-256 checksums for distributable artifacts. Prefer Chrome Web Store
publication for nontechnical users and automatic updates.

## Completion criteria

Work is complete only when:

- The endpoint is reachable at the URL shown to the user.
- Unauthorized requests fail before provider calls or writes.
- No secret token is committed or logged.
- Page metadata is canonicalized server-side.
- Member-scope invariants remain intact.
- Handoffs are addressed, deduplicated, bounded, claimed, and deleted.
- Popup drafts survive closure.
- The extension succeeds against a live supported page.
- Static checks and live route/RPC checks pass.
- Packaging excludes the private signing key.
