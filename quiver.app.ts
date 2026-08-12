import type { AppManifest } from "@quiver/system";

const manifest: AppManifest = {
  displayName: "Bookie",
  summary: "Search, shelve, rate, and review books together as a channel.",
  entrypoints: {
    channel: "src/app.tsx",
    commands: {
      book: {
        file: "src/commands/book.ts",
        description:
          "Search for a book and post a card for it in the channel.",
        argsHint: "<title or author>",
      },
    },
  },
  queries: {
    channelShelf: {
      summary:
        "List books on this channel's shelf, optionally filtered by status, with per-member shelving info.",
    },
    bookDetail: {
      summary:
        "Return a book's cached metadata plus this channel's shelvings and reviews for it.",
    },
    myShelvings: {
      summary: "List the calling member's own shelvings in this channel.",
    },
  },
  mutations: {
    addToShelf: {
      summary:
        "Cache a book from search results and add it to the calling member's shelf.",
    },
    updateShelfStatus: {
      summary:
        "Change the calling member's shelf status or reading progress for a book.",
    },
    removeFromShelf: {
      summary: "Remove a book from the calling member's shelf.",
    },
    rateBook: {
      summary:
        "Set or update the calling member's star rating and review text for a book.",
    },
    shareFinishedToChat: {
      summary:
        "Post a message to the channel celebrating that the calling member finished a book.",
    },
  },
  actions: {
    searchBooks: {
      summary: "Search literal.club for books by title or author.",
    },
  },
  chat: {
    write: true,
  },
  env: {
    LITERAL_TOKEN: {
      scope: "server",
      required: true,
      description: "Bearer token for the literal.club GraphQL API.",
    },
  },
};

export default manifest;
