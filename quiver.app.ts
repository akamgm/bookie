import type { AppManifest } from "@quiver/system";

const manifest: AppManifest = {
  displayName: "Bookie",
  summary: "Keep one personal reading library across every Quiver channel.",
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
        "List books in the calling member's instance-wide library, optionally filtered by status.",
    },
    bookDetail: {
      summary:
        "Return cached book metadata plus the calling member's shelving and review.",
    },
    myShelvings: {
      summary: "List the calling member's shelvings across the Quiver instance.",
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
    recordPanelBase: {
      summary:
        "Record the channel panel's base URL for generating chat deep links.",
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
  // LITERAL_TOKEN: bearer token for the literal.club GraphQL API, used
  // server-side only by the searchBooks action.
  env: {
    LITERAL_TOKEN: {
      scope: "server",
      required: true,
    },
  },
};

export default manifest;
