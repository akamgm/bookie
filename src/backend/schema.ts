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
      v.literal("unfinished"),
    ),
    progressPercent: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    // Retain the original creation date when a library is imported.
    dateAdded: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .scope("member")
    .index("by_bookId", ["bookId"])
    .index("by_status", ["status"]),

  // Deliberately minimal social projection of member shelves. The private
  // member-scoped shelving remains the source of truth; this shared table
  // exposes only the member handle and public shelf state.
  publicShelvings: defineTable({
    handle: v.string(),
    bookId: v.id("books"),
    status: v.union(
      v.literal("want"),
      v.literal("reading"),
      v.literal("read"),
      v.literal("unfinished"),
    ),
    progressPercent: v.optional(v.number()),
    dateAdded: v.number(),
    updatedAt: v.number(),
  })
    .scope("quiver")
    .index("by_handle", ["handle"])
    .index("by_handle_bookId", ["handle", "bookId"])
    .index("by_handle_status", ["handle", "status"]),

  // Immutable shelf transitions for the calling member. Missing fromStatus
  // means the book was newly shelved; missing toStatus means it was removed.
  // Keeping transitions separate from the current shelving row preserves
  // repeated reading attempts for future duration and activity statistics.
  shelfActivity: defineTable({
    bookId: v.id("books"),
    fromStatus: v.optional(
      v.union(
        v.literal("want"),
        v.literal("reading"),
        v.literal("read"),
        v.literal("unfinished"),
      ),
    ),
    toStatus: v.optional(
      v.union(
        v.literal("want"),
        v.literal("reading"),
        v.literal("read"),
        v.literal("unfinished"),
      ),
    ),
    occurredAt: v.number(),
  })
    .scope("member")
    .index("by_bookId", ["bookId"])
    .index("by_occurredAt", ["occurredAt"]),

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

  // Personal UI preferences follow the member across every channel and also
  // remain available to the channel-less global settings entrypoint.
  memberPreferences: defineTable({
    shelfDisplay: v.union(v.literal("details"), v.literal("covers")),
  }).scope("member"),

  // Capability tokens used by the browser extension. Only the SHA-256 hash is
  // retained, so a database read cannot recover a usable credential. The
  // member field lets the anonymous public route restore the member context
  // before calling the normal shelving mutation.
  extensionCredentials: defineTable({
    member: v.string(),
    tokenHash: v.string(),
    createdAt: v.number(),
  })
    .scope("quiver")
    .index("by_member", ["member"])
    .index("by_tokenHash", ["tokenHash"]),

  // Public routes cannot enter a member-scoped database context. They place a
  // canonical book reference here; the addressed member's authenticated UI
  // claims it into `shelvings` and deletes it. No private shelf data is
  // projected into this handoff table.
  extensionImports: defineTable({
    member: v.string(),
    bookId: v.id("books"),
    status: v.union(
      v.literal("want"),
      v.literal("reading"),
      v.literal("read"),
      v.literal("unfinished"),
    ),
    createdAt: v.number(),
  })
    .scope("quiver")
    .index("by_member", ["member"])
    .index("by_member_bookId", ["member", "bookId"]),

  // Channel-specific settings (such as the base URL of the channel's app
  // panel, used to build deep links back into it from chat posts).
  settings: defineTable({
    panelBase: v.optional(v.string()),
  }),
});
