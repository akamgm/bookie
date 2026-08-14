import { query, mutation, action, v } from "@quiver/server";

const LITERAL_ENDPOINT = "https://literal.club/graphql/";

const SEARCH_QUERY = `
  query SearchBooks($query: String!) {
    searchBookV2(query: $query) {
      id
      title
      subtitle
      description
      isbn10
      isbn13
      pageCount
      publishedDate
      publisher
      cover
      authors { name }
    }
  }
`;

async function upsertBook(
  ctx: { db: any },
  book: {
    literalId: string;
    title: string;
    subtitle?: string;
    authors: string[];
    coverUrl?: string;
    isbn10?: string;
    isbn13?: string;
    pageCount?: number;
    publishedDate?: string;
    publisher?: string;
    description?: string;
  },
) {
  const existing = await ctx.db
    .query("books")
    .withIndex("by_literalId", (q: any) => q.eq("literalId", book.literalId))
    .first();
  if (existing) return existing._id;
  return ctx.db.insert("books", { ...book, cachedAt: Date.now() });
}

async function recordShelfTransition(
  ctx: { db: any },
  bookId: any,
  fromStatus: "want" | "reading" | "read" | "unfinished" | undefined,
  toStatus: "want" | "reading" | "read" | "unfinished" | undefined,
  occurredAt: number,
) {
  if (fromStatus === toStatus) return;
  await ctx.db.insert("shelfActivity", {
    bookId,
    ...(fromStatus !== undefined ? { fromStatus } : {}),
    ...(toStatus !== undefined ? { toStatus } : {}),
    occurredAt,
  });
}

export const cacheBookDetails = mutation({
  args: {
    book: v.object({
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
    }),
  },
  handler: async (ctx, { book }) => upsertBook(ctx, book),
});

export const searchBooks = action({
  args: { query: v.string() },
  handler: async (ctx, { query: searchQuery }) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return [];

    const res = await fetch(LITERAL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.env.LITERAL_TOKEN}`,
      },
      body: JSON.stringify({ query: SEARCH_QUERY, variables: { query: trimmed } }),
    });

    if (!res.ok) {
      throw new Error(`literal.club search failed: ${res.status}`);
    }
    const json = await res.json();
    if (json.errors?.length) {
      throw new Error(`literal.club search error: ${json.errors[0].message}`);
    }

    const results = (json.data?.searchBookV2 ?? []) as Array<{
      id: string;
      title: string;
      subtitle?: string;
      description?: string;
      isbn10?: string;
      isbn13?: string;
      pageCount?: number;
      publishedDate?: string;
      publisher?: string;
      cover?: string;
      authors: { name: string }[];
    }>;

    return results.map((r) => ({
      literalId: r.id,
      title: r.title,
      subtitle: r.subtitle ?? undefined,
      authors: r.authors.map((a) => a.name),
      coverUrl: r.cover ?? undefined,
      isbn10: r.isbn10 ?? undefined,
      isbn13: r.isbn13 ?? undefined,
      pageCount: r.pageCount ?? undefined,
      publishedDate: r.publishedDate ?? undefined,
      publisher: r.publisher ?? undefined,
      description: r.description ?? undefined,
    }));
  },
});

export const addToShelf = mutation({
  args: {
    caller: v.string(),
    book: v.object({
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
    }),
    status: v.union(
      v.literal("want"),
      v.literal("reading"),
      v.literal("read"),
      v.literal("unfinished"),
    ),
  },
  handler: async (ctx, { caller, book, status }) => {
    const bookId = await upsertBook(ctx, book);

    const existing = await ctx.db
      .query("shelvings")
      .withIndex("by_bookId", (q: any) => q.eq("bookId", bookId))
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status,
        updatedAt: now,
        ...(status === "reading" && !existing.startedAt ? { startedAt: now } : {}),
        ...(status === "read" && !existing.finishedAt ? { finishedAt: now } : {}),
      });
      await recordShelfTransition(ctx, bookId, existing.status, status, now);
    } else {
      await ctx.db.insert("shelvings", {
        bookId,
        status,
        updatedAt: now,
        ...(status === "reading" ? { startedAt: now } : {}),
        ...(status === "read" ? { finishedAt: now } : {}),
      });
      await recordShelfTransition(ctx, bookId, undefined, status, now);
    }
    return bookId;
  },
});

export const updateShelfStatus = mutation({
  args: {
    caller: v.string(),
    bookId: v.id("books"),
    status: v.optional(
      v.union(
        v.literal("want"),
        v.literal("reading"),
        v.literal("read"),
        v.literal("unfinished"),
      ),
    ),
    progressPercent: v.optional(v.number()),
  },
  handler: async (ctx, { caller, bookId, status, progressPercent }) => {
    const existing = await ctx.db
      .query("shelvings")
      .withIndex("by_bookId", (q: any) => q.eq("bookId", bookId))
      .first();

    const now = Date.now();

    // The book detail page is reachable straight from a cached search
    // result now, before the viewer has ever shelved it — so there may
    // be no existing row to patch. Upsert, same as addToShelf.
    if (!existing) {
      if (!status) throw new Error("Book is not on your shelf.");
      await ctx.db.insert("shelvings", {
        bookId,
        status,
        updatedAt: now,
        ...(status === "reading" ? { startedAt: now } : {}),
        ...(status === "read" ? { finishedAt: now } : {}),
        ...(progressPercent !== undefined
          ? { progressPercent: Math.max(0, Math.min(100, progressPercent)) }
          : {}),
      });
      await recordShelfTransition(ctx, bookId, undefined, status, now);
      return;
    }

    const patch: Record<string, unknown> = { updatedAt: now };
    if (status) {
      patch.status = status;
      if (status === "reading" && !existing.startedAt) patch.startedAt = now;
      if (status === "read" && !existing.finishedAt) patch.finishedAt = now;
    }
    if (progressPercent !== undefined) {
      patch.progressPercent = Math.max(0, Math.min(100, progressPercent));
    }
    await ctx.db.patch(existing._id, patch);
    if (status) {
      await recordShelfTransition(ctx, bookId, existing.status, status, now);
    }
  },
});

export const removeFromShelf = mutation({
  args: { caller: v.string(), bookId: v.id("books") },
  handler: async (ctx, { caller, bookId }) => {
    const existing = await ctx.db
      .query("shelvings")
      .withIndex("by_bookId", (q: any) => q.eq("bookId", bookId))
      .first();
    if (existing) {
      const now = Date.now();
      await ctx.db.delete(existing._id);
      await recordShelfTransition(ctx, bookId, existing.status, undefined, now);
    }
  },
});

export const rateBook = mutation({
  args: {
    caller: v.string(),
    bookId: v.id("books"),
    rating: v.number(),
    body: v.optional(v.string()),
  },
  handler: async (ctx, { caller, bookId, rating, body }) => {
    if (rating < 0.5 || rating > 5 || Math.round(rating * 2) !== rating * 2) {
      throw new Error("Rating must be between 0.5 and 5, in half-star steps.");
    }
    const existing = await ctx.db
      .query("reviews")
      .withIndex("by_bookId", (q: any) => q.eq("bookId", bookId))
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { rating, body, updatedAt: now });
    } else {
      await ctx.db.insert("reviews", { bookId, rating, body, updatedAt: now });
    }
  },
});

export const saveBookNote = mutation({
  args: {
    caller: v.string(),
    bookId: v.id("books"),
    body: v.string(),
  },
  handler: async (ctx, { bookId, body }) => {
    if (body.length > 5000) {
      throw new Error("Notes must be 5,000 characters or fewer.");
    }
    const book = await ctx.db.get(bookId);
    if (!book) throw new Error("Book not found.");

    const existing = await ctx.db
      .query("notes")
      .withIndex("by_bookId", (q: any) => q.eq("bookId", bookId))
      .first();

    if (!body.trim()) {
      if (existing) await ctx.db.delete(existing._id);
      return;
    }

    if (existing) {
      await ctx.db.patch(existing._id, { body, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("notes", { bookId, body, updatedAt: Date.now() });
    }
  },
});

export const shareFinishedToChat = mutation({
  args: { caller: v.string(), bookId: v.id("books") },
  handler: async (ctx, { caller, bookId }) => {
    const book = await ctx.db.get(bookId);
    if (!book) throw new Error("Book not found.");
    const shelving = await ctx.db
      .query("shelvings")
      .withIndex("by_bookId", (q: any) => q.eq("bookId", bookId))
      .first();
    if (shelving?.status !== "read") {
      throw new Error("Mark this book as read before sharing it to chat.");
    }
    const review = await ctx.db
      .query("reviews")
      .withIndex("by_bookId", (q: any) => q.eq("bookId", bookId))
      .first();

    const isSameDayUTC = (t1: number, t2: number) => {
      const d1 = new Date(t1);
      const d2 = new Date(t2);
      return d1.getUTCFullYear() === d2.getUTCFullYear() &&
             d1.getUTCMonth() === d2.getUTCMonth() &&
             d1.getUTCDate() === d2.getUTCDate();
    };

    const formatFriendlyDate = (timestamp: number) => {
      const d = new Date(timestamp);
      const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
      ];
      return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
    };

    const authors = book.authors.length > 0 ? ` by ${book.authors.join(", ")}` : "";

    const settings = await ctx.db.query("settings").first();
    const panelBase = settings?.panelBase || "";
    const titleText = panelBase
      ? `[${book.title}](${panelBase}/book/${bookId})`
      : `**${book.title}**`;

    let bodyText = `📚 @${caller} finished ${titleText}${authors}`;

    if (shelving.finishedAt !== undefined && !isSameDayUTC(shelving.finishedAt, Date.now())) {
      bodyText += ` on ${formatFriendlyDate(shelving.finishedAt)}`;
    }

    if (review) {
      const fullStars = Math.round(review.rating);
      const stars = "★".repeat(fullStars) + "☆".repeat(5 - fullStars);
      bodyText += ` — ${stars}`;
    }

    if (review?.body && review.body.trim() !== "") {
      bodyText += `\n\n_${review.body.trim()}_`;
    }

    const attachments = [];
    if (book.coverUrl) {
      attachments.push({
        type: "image",
        src: book.coverUrl,
        alt: book.title,
      });
    }

    await ctx.platform.chat.send({
      body: bodyText,
      ...(attachments.length > 0 ? { attachments } : {}),
    });
  },
});

export const channelShelf = query({
  args: {
    caller: v.string(),
    status: v.optional(
      v.union(
        v.literal("want"),
        v.literal("reading"),
        v.literal("read"),
        v.literal("unfinished"),
      ),
    ),
  },
  handler: async (ctx, { status }) => {
    const shelvings = status
      ? await ctx.db
          .query("shelvings")
          .withIndex("by_status", (q: any) => q.eq("status", status))
          .collect()
      : await ctx.db.query("shelvings").collect();

    const byBook = new Map<string, typeof shelvings>();
    for (const row of shelvings) {
      const key = row.bookId as unknown as string;
      const list = byBook.get(key) ?? [];
      list.push(row);
      byBook.set(key, list);
    }

    const books = [];
    for (const [bookId, rows] of byBook) {
      const book = await ctx.db.get(rows[0].bookId);
      if (!book) continue;
      const reviews = await ctx.db
        .query("reviews")
        .withIndex("by_bookId", (q: any) => q.eq("bookId", rows[0].bookId))
        .collect();
      const avgRating = reviews.length
        ? reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length
        : null;
      books.push({
        book,
        shelving: {
          status: rows[0].status,
          progressPercent: rows[0].progressPercent,
          dateAdded: rows[0]._creationTime,
          updatedAt: rows[0].updatedAt,
        },
        avgRating,
        ratingCount: reviews.length,
      });
    }
    return books;
  },
});

export const bookDetail = query({
  args: { caller: v.string(), bookId: v.id("books") },
  handler: async (ctx, { bookId }) => {
    const book = await ctx.db.get(bookId);
    if (!book) return null;
    const shelvings = await ctx.db
      .query("shelvings")
      .withIndex("by_bookId", (q: any) => q.eq("bookId", bookId))
      .collect();
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_bookId", (q: any) => q.eq("bookId", bookId))
      .collect();
    const note = await ctx.db
      .query("notes")
      .withIndex("by_bookId", (q: any) => q.eq("bookId", bookId))
      .first();
    const avgRating = reviews.length
      ? reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length
      : null;
    return {
      book,
      shelving: shelvings[0] ?? null,
      review: reviews[0] ?? null,
      note: note?.body ?? null,
      avgRating,
      ratingCount: reviews.length,
    };
  },
});

export const myShelvings = query({
  args: { caller: v.string() },
  handler: async (ctx) => {
    const shelvings = await ctx.db.query("shelvings").collect();
    const out = [];
    for (const row of shelvings) {
      const book = await ctx.db.get(row.bookId);
      if (book) out.push({ ...row, book });
    }
    return out;
  },
});

export const myBookActivity = query({
  args: {
    caller: v.string(),
    bookId: v.optional(v.id("books")),
  },
  handler: async (ctx, { bookId }) => {
    const activity = bookId
      ? await ctx.db
          .query("shelfActivity")
          .withIndex("by_bookId", (q: any) => q.eq("bookId", bookId))
          .collect()
      : await ctx.db.query("shelfActivity").collect();

    const out = [];
    for (const row of activity.sort((a: any, b: any) => b.occurredAt - a.occurredAt)) {
      const book = await ctx.db.get(row.bookId);
      if (book) out.push({ ...row, book });
    }
    return out;
  },
});

// The iframe tells the server where it is mounted, so chat posts can link back
// into it. Idempotent: the panel calls this on every open and it only writes
// when the path actually changed.
export const recordPanelBase = mutation({
  args: { base: v.string() },
  handler: async (ctx, { base }) => {
    const clean = base.replace(/\/+$/, "");
    if (!clean.startsWith("/")) return { panelBase: "" };
    const row = await ctx.db.query("settings").first();
    if (row) {
      if (row.panelBase === clean) return { panelBase: clean };
      await ctx.db.patch(row._id, { panelBase: clean });
    } else {
      await ctx.db.insert("settings", { panelBase: clean });
    }
    return { panelBase: clean };
  },
});

// Not manifest-declared — only reached server-side (slash commands, chat
// posts) via ctx.runQuery, never client-addressable.
export const getPanelBase = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("settings").first();
    return row?.panelBase ?? "";
  },
});
