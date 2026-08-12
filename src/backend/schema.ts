import { defineSchema, defineTable, v } from "@quiver/server";

export default defineSchema({
  // Cached book metadata from literal.club. One row per distinct book this
  // channel has ever searched-and-added, shared by every member.
  books: defineTable({
    literalId: v.string(),
    title: v.string(),
    subtitle: v.optional(v.string()),
    authors: v.array(v.string()),
    coverUrl: v.optional(v.string()),
    isbn10: v.optional(v.string()),
    isbn13: v.optional(v.string()),
    pageCount: v.optional(v.number()),
    publishedDate: v.optional(v.string()),
    publisher: v.optional(v.string()),
    description: v.optional(v.string()),
    cachedAt: v.number(),
  }).index("by_literalId", ["literalId"]),

  // One row per (member, book): where that member has this book shelved.
  shelvings: defineTable({
    bookId: v.id("books"),
    handle: v.string(),
    status: v.union(
      v.literal("want"),
      v.literal("reading"),
      v.literal("read"),
    ),
    progressPercent: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_bookId", ["bookId"])
    .index("by_handle", ["handle"])
    .index("by_status", ["status"])
    .index("by_handle_book", ["handle", "bookId"]),

  // One row per (member, book): that member's rating/review of the book.
  reviews: defineTable({
    bookId: v.id("books"),
    handle: v.string(),
    rating: v.number(),
    body: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_bookId", ["bookId"])
    .index("by_handle_book", ["handle", "bookId"]),

  // Channel-specific settings (such as the base URL of the channel's app
  // panel, used to build deep links back into it from chat posts).
  settings: defineTable({
    panelBase: v.optional(v.string()),
  }),
});
