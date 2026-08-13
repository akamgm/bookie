# Bookie — working notes

Run `quiver docs intro` for platform basics before making changes.

Bookie is a personal reading tracker that follows each member across
channels: search literal.club, shelve books (want/reading/read), rate and
review. See `README.md` for the data model and surfaces.

## Invariants

- **Shelves and reviews are `.scope("member")`.** They follow the caller
  across every channel and are not readable by other members. Book metadata
  is `.scope("quiver")` so all personal libraries can reference the same
  cached book. Keep panel-link settings channel-scoped. Scope migrations must
  remove the old `channelId` but preserve the existing `handle`.
- **`literal.club` calls only happen server-side**, in the `searchBooks`
  action, using the server-scoped `LITERAL_TOKEN` env var. Never inline
  that token into the iframe (`scope: "iframe"` would expose it in
  devtools).
- **Books are cached on search, not just on add.** `searchBooks` (an
  action, so no `ctx.db`) calls the internal `cacheSearchResults`
  mutation via `ctx.runMutation` to upsert every result into `books`,
  keyed by `literalId`, and returns each result with its real `bookId`
  attached. This is what lets Discover route a click straight to
  `BookDetail` instead of a separate unsaved-preview screen. `addToShelf`
  still upserts too (same `upsertBook` helper) so it works standalone —
  the two paths are idempotent against each other via the
  `by_literalId` lookup, not a race.
- **One shelving/review row per member-scoped `bookId`**, enforced by
  upsert logic against the `by_bookId` index in `addToShelf`,
  `updateShelfStatus`, and `rateBook`. `updateShelfStatus` upserts
  (inserts when no row exists, given a `status`) rather than requiring
  a prior `addToShelf` call — necessary now that `BookDetail` is
  reachable for a book the viewer has never shelved. Don't add a
  second insert path that skips the existing-row lookup.
- **Chat posts are explicit, never automatic.** `shareFinishedToChat` is
  a member-triggered mutation gated on `status === "read"` — nothing
  posts to the channel on its own when a book is marked read.
- **Inline `args:` object validators in each `query`/`mutation`/`action`
  call — don't factor a shared `v.object({...})` into a top-level
  `const` and reference it from two exports.** `quiver check` and
  `quiver dev` both accept it fine, but the real deploy pipeline (the
  `git push` build step) fails at `start_push` with
  `ReferenceError: <name> is not defined` in the generated
  `appCalls.js`, well after both of those pass — the only signal is in
  the push output itself. Costly to catch; a little duplication in
  `args:` blocks is cheaper than re-debugging this.
- **`useAppPath().push()` writes into the actual browser/shell URL,
  not just in-memory route state.** Pushing a bad segment (e.g. a
  stringified `undefined`) leaves the tab wedged on that URL across
  reloads and reconnects, repeating the same broken query forever.
  Validate any path segment before trusting it as a real id, and
  guard against ever calling the id-consuming callback with a missing
  id in the first place — see the `/book/:id` parsing effect and
  `Discover`'s `onOpenBook` guard in `src/app.tsx`.

## Unverified

Live-verified via `quiver call` and a real browser session
(`agent-browser`) as of this writing: Discover renders and searches,
and a malformed `/book/:id` URL now self-heals instead of wedging the
app. The full search → real `bookId` → click → `BookDetail` path was
still blocked at the time by the `bookInput`-not-defined deploy
failure above; that's now fixed and pushed, but hasn't been
re-verified live yet — do that before assuming the click flow works
end to end.
