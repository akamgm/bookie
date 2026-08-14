import { defineSchema, defineTable, v } from "@quiver/server";

export default defineSchema({
  // Cached book metadata from literal.club. Metadata is shared across the
  // whole Quiver so every member-scoped library can reference the same book.
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
  })
    .scope("quiver")
    .index("by_literalId", ["literalId"]),

  // One row per book in the calling member's instance-wide library.
  shelvings: defineTable({
    bookId: v.id("books"),
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
    .scope("member")
    .index("by_bookId", ["bookId"])
    .index("by_status", ["status"]),

  // One row per book in the calling member's instance-wide reviews.
  reviews: defineTable({
    bookId: v.id("books"),
    rating: v.number(),
    body: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .scope("member")
    .index("by_bookId", ["bookId"]),

  // Private notes are separate from reviews so they are never included in
  // chat shares and remain available if the member removes a book from a shelf.
  notes: defineTable({
    bookId: v.id("books"),
    body: v.string(),
    updatedAt: v.number(),
  })
    .scope("member")
    .index("by_bookId", ["bookId"]),

  // Channel-specific settings (such as the base URL of the channel's app
  // panel, used to build deep links back into it from chat posts).
  settings: defineTable({
    panelBase: v.optional(v.string()),
  }),
});
