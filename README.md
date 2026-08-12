# Bookie

A shared reading tracker for a Quiver channel. Search books via
literal.club, shelve them (Want to Read / Reading / Read), rate and
review, and see what the rest of the channel is reading.

## Data model

Shelves and reviews are **channel-scoped** with an explicit `handle`
column (not `.scope("member")`) — every member of the channel sees the
same shared library, like a book club rather than a personal account.
See `src/backend/schema.ts`.

## literal.club integration

`searchBooks` (`src/backend/functions.ts`) is a server-side action that
calls literal.club's GraphQL API (`searchBookV2`) with a bearer token
from the required `LITERAL_TOKEN` env var (`scope: "server"`, never
exposed to the iframe). Search results are ephemeral; a book is only
cached into the `books` table once a member actually adds it to a
shelf, via `addToShelf`.

## Surfaces

- `channel` iframe (`src/app.tsx`) — Discover (search + add), Shelves
  (browse/filter the channel's library), Book detail (shelf status,
  progress, rating/review).
- `/book <title>` slash command — quick search that posts a book card
  to chat without opening the panel.
