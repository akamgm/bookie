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
- **Books are cached on add, not on search.** Search results are
  ephemeral (an action return value); `addToShelf` is what upserts a
  `books` row, keyed by `literalId`. Don't cache raw search results into
  the table — only books someone actually shelves.
- **One shelving/review row per (handle, bookId)**, enforced by upsert
  logic against the `by_handle_book` index in `addToShelf`,
  `updateShelfStatus`, and `rateBook`. Don't add a second insert path
  that skips the existing-row lookup.
- **Chat posts are explicit, never automatic.** `shareFinishedToChat` is
  a member-triggered mutation gated on `status === "read"` — nothing
  posts to the channel on its own when a book is marked read.

## Unverified

Backend functions have not yet been exercised over RPC (`quiver call`)
against a live channel, and the UI has not been reviewed in a browser.
