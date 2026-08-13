# Bookie — working notes

Run `quiver docs intro` for platform basics before making changes.

Bookie is a shared, channel-scoped reading tracker: search literal.club,
shelve books (want/reading/read), rate and review. See `README.md` for
the data model and surfaces.

## Invariants

- **Shelves and reviews are channel-scoped, not `.scope("member")`.**
  The product intent is a shared library visible to everyone in the
  channel (like a book club), not a personal cross-channel library.
  Don't switch this to member scope without redesigning the visibility
  story — member-scoped rows aren't readable by other members through
  the normal scoped query builder.
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
- **One shelving/review row per (handle, bookId)**, enforced by upsert
  logic against the `by_handle_book` index in `addToShelf`,
  `updateShelfStatus`, and `rateBook`. `updateShelfStatus` upserts
  (inserts when no row exists, given a `status`) rather than requiring
  a prior `addToShelf` call — necessary now that `BookDetail` is
  reachable for a book the viewer has never shelved. Don't add a
  second insert path that skips the existing-row lookup.
- **Chat posts are explicit, never automatic.** `shareFinishedToChat` is
  a member-triggered mutation gated on `status === "read"` — nothing
  posts to the channel on its own when a book is marked read.

## Unverified

Backend functions have not yet been exercised over RPC (`quiver call`)
against a live channel, and the UI has not been reviewed in a browser.
