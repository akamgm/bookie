# Bookie

A social reading tracker that follows you across Quiver channels. Search books
via literal.club, shelve them (Want to Read / Reading / Read / Haven't
Finished), rate and review them, keep private notes, browse other members'
public shelves, and open the same library wherever Bookie is installed.

## Data model

Shelves, immutable shelf activity, reviews, and notes are **member-scoped**, so
each person has one source-of-truth library across the whole Quiver instance.
A minimal **quiver-scoped** projection publishes each member's book, shelf
status, and reading progress for the Users tab; it never includes reviews,
private notes, or shelf-transition history. Activity records every move between
shelves, along with initial shelving and removal, so repeated reading attempts
remain available for future statistics. Notes are stored separately from
reviews and are never included in chat shares. Cached book metadata is
**quiver-scoped** and reused by those personal libraries.
Channel-scoped settings remain local because chat links must point back to the
current channel's Bookie panel. The migrations in `src/migrations/` remove the
old channel identity fields while preserving each member's existing `handle`.
See `src/backend/schema.ts`.

## literal.club integration

`searchBooks` (`src/backend/functions.ts`) is a server-side action that
calls literal.club's GraphQL API (`searchBookV2`) with a bearer token
from the required `LITERAL_TOKEN` env var (`scope: "server"`, never
exposed to the iframe). Search results are ephemeral; a book is only
cached into the `books` table when a member opens its detail page, via
`cacheBookDetails`, or adds it directly to a shelf, via `addToShelf`.

## Surfaces

- `channel` iframe (`src/app.tsx`) — Discover (search + add), Shelves
  (browse/filter your global library), Users (browse members and their public
  shelves), Book detail (shelf status, activity history, progress, private
  notes, rating/review).
- `/book <title>` slash command — quick search that posts a book card
  to chat without opening the panel.
