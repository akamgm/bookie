# Add to Bookie Chrome extension

This Manifest V3 extension extracts book metadata from the active page and
adds the canonical literal.club book to a configured Bookie shelf. It includes
site-specific support for:

- Amazon
- Goodreads
- The StoryGraph
- Literal
- Barnes & Noble
- Bookshop.org
- Kobo
- Google Books and Google Play Books
- Waterstones
- AbeBooks

Pages from other bookstores, publishers, libraries, and book-sharing sites
also work when they publish Schema.org `Book` or `Product` data, standard
Open Graph fields, or common citation metadata.

## Install for development

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select this `extension/` directory.
4. In a Quiver channel, open Bookie’s **Extension** tab.
5. Copy the API endpoint. Create a token and copy it immediately.
6. Open the extension popup, expand **Connection settings**, paste both
   values, and save.

Chrome closes extension popups when you switch back to another tab or window.
Bookie preserves each connection field as a draft while you move between the
popup and Quiver, so you can paste the endpoint and token in separate visits.
Extension versions that used the broken per-install canonical route migrate
that saved endpoint to Bookie’s quiver-wide route automatically.

The token grants write access to the owner’s reading list. Chrome stores it in
extension-local storage. Bookie stores only its SHA-256 hash. Replacing the
token in Bookie revokes the old credential immediately.

Quiver deliberately prevents anonymous public routes from entering a member’s
private database scope. The endpoint therefore queues an addressed canonical
book reference, and the authenticated Bookie UI claims it into the private
shelf immediately while open (or the next time Bookie is opened).

## Supported metadata

The extractor prefers structured JSON-LD and supplements it with site-specific
title, author, cover, ISBN, publisher, and page-count fields. It recognizes
lazy-loaded covers and common citation and `books:isbn` metadata. Bookie does
not trust page metadata as its canonical record: the server searches
literal.club and requires an ISBN match or an exact normalized title/author
match before shelving the book.

## Test

From the repository root:

```sh
mise exec -- bun test extension/tests
```
