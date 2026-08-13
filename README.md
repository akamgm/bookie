# Bookie

A personal reading tracker that follows you across Quiver channels. Search
books via literal.club, shelve them (Want to Read / Reading / Read), rate
and review them, and open the same library wherever Bookie is installed.

## Data model

Shelves and reviews are **member-scoped**, so each person sees one private
library across the whole Quiver instance. Cached book metadata is
**quiver-scoped** and reused by those personal libraries. Channel-scoped
settings remain local because chat links must point back to the current
channel's Bookie panel. The migrations in `src/migrations/` remove the old
channel identity fields while preserving each member's existing `handle`.
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
  (browse/filter your global library), Book detail (shelf status,
  progress, rating/review).
- `/book <title>` slash command — quick search that posts a book card
  to chat without opening the panel.
