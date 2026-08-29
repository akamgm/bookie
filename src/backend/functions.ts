import { api, query, mutation, action, v } from "@quiver/server";

const LITERAL_ENDPOINT = "https://literal.club/graphql/";
const EXTENSION_TOKEN_PREFIX = "bookie_";

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

type BookMetadata = {
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
};

async function fetchLiteralBooks(token: string, searchQuery: string): Promise<BookMetadata[]> {
  const res = await fetch(LITERAL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query: SEARCH_QUERY, variables: { query: searchQuery } }),
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
}

async function upsertBook(
  ctx: { db: any },
  book: BookMetadata,
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

async function upsertPublicShelving(
  ctx: { db: any },
  handle: string,
  shelving: {
    bookId: any;
    status: "want" | "reading" | "read" | "unfinished";
    progressPercent?: number;
    updatedAt: number;
    _creationTime: number;
  },
) {
  const existing = await ctx.db
    .query("publicShelvings")
    .withIndex("by_handle_bookId", (q: any) =>
      q.eq("handle", handle).eq("bookId", shelving.bookId),
    )
    .first();
  const value = {
    handle,
    bookId: shelving.bookId,
    status: shelving.status,
    progressPercent: shelving.progressPercent,
    dateAdded: shelving._creationTime,
    updatedAt: shelving.updatedAt,
  };
  if (existing) {
    await ctx.db.patch(existing._id, value);
  } else {
    await ctx.db.insert("publicShelvings", value);
  }
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
  args: {
    query: v.string(),
    strictAuthor: v.optional(v.string()),
  },
  handler: async (ctx, { query: searchQuery, strictAuthor }) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return [];
    const exactAuthor = strictAuthor?.trim();
    const results = await fetchLiteralBooks(ctx.env.LITERAL_TOKEN, trimmed);

    return results
      .filter(
        (r) =>
          !exactAuthor || r.authors.some((author) => author === exactAuthor),
      )
      .map((r) => r);
  },
});

function makeExtensionToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let value = EXTENSION_TOKEN_PREFIX;
  for (const byte of bytes) value += byte.toString(16).padStart(2, "0");
  return value;
}

async function hashExtensionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export const extensionCredentialStatus = query({
  args: { caller: v.string() },
  handler: async (ctx, { caller }) => {
    const credential = await ctx.db
      .query("extensionCredentials")
      .withIndex("by_member", (q: any) => q.eq("member", caller))
      .first();
    return credential ? { configured: true, createdAt: credential.createdAt } : {
      configured: false,
    };
  },
});

// Internal: only createExtensionCredential calls this after generating and
// hashing a token server-side.
export const storeExtensionCredential = mutation({
  args: { member: v.string(), tokenHash: v.string() },
  handler: async (ctx, { member, tokenHash }) => {
    const existing = await ctx.db
      .query("extensionCredentials")
      .withIndex("by_member", (q: any) => q.eq("member", member))
      .first();
    const value = { member, tokenHash, createdAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, value);
    } else {
      await ctx.db.insert("extensionCredentials", value);
    }
  },
});

export const createExtensionCredential = action({
  args: { caller: v.string() },
  handler: async (ctx, { caller }) => {
    const token = makeExtensionToken();
    const tokenHash = await hashExtensionToken(token);
    await ctx.runMutation(api.backend.functions.storeExtensionCredential, {
      member: caller,
      tokenHash,
    });
    return { token };
  },
});

// Internal: the public action only gets the member identity after proving
// possession of a bearer token.
export const extensionCredentialByHash = query({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    return await ctx.db
      .query("extensionCredentials")
      .withIndex("by_tokenHash", (q: any) => q.eq("tokenHash", tokenHash))
      .first();
  },
});

function requestHeader(headers: unknown, name: string): string {
  if (!headers || typeof headers !== "object") return "";
  const wanted = name.toLowerCase();
  if (Array.isArray(headers)) {
    const pair = headers.find(
      (entry) =>
        Array.isArray(entry) && String(entry[0]).toLowerCase() === wanted,
    );
    return pair ? String(pair[1]) : "";
  }
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() === wanted) return String(value);
  }
  return "";
}

function requestBody(request: any): unknown {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body !== "string" || request.body.length > 20_000) return null;
  let body = request.body;
  if (request.bodyEncoding === "base64") {
    const bytes = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
    body = new TextDecoder().decode(bytes);
  }
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function normalizeIsbn(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/[^0-9X]/gi, "").toUpperCase()
    : "";
}

function normalizeBookText(value: unknown): string {
  return typeof value === "string"
    ? value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim()
    : "";
}

function selectLiteralMatch(
  results: BookMetadata[],
  source: { title: string; authors: string[]; isbn10?: string; isbn13?: string },
): BookMetadata | undefined {
  const sourceIsbns = new Set(
    [source.isbn10, source.isbn13].map(normalizeIsbn).filter(Boolean),
  );
  if (sourceIsbns.size > 0) {
    const isbnMatch = results.find((book) =>
      [book.isbn10, book.isbn13].map(normalizeIsbn).some((isbn) => sourceIsbns.has(isbn)),
    );
    if (isbnMatch) return isbnMatch;
  }

  const title = normalizeBookText(source.title);
  const sourceAuthors = source.authors.map(normalizeBookText).filter(Boolean);
  return results.find((book) => {
    const candidateTitles = [
      normalizeBookText(book.title),
      normalizeBookText(`${book.title} ${book.subtitle ?? ""}`),
    ];
    if (!candidateTitles.includes(title)) return false;
    if (sourceAuthors.length === 0) return true;
    const candidateAuthors = book.authors.map(normalizeBookText);
    return sourceAuthors.some((author) =>
      candidateAuthors.some(
        (candidate) => candidate === author || candidate.includes(author) || author.includes(candidate),
      ),
    );
  });
}

function jsonResponse(status: number, value: Record<string, unknown>) {
  return {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(value),
  };
}

export const addBookFromExtension = action({
  args: {},
  handler: async (ctx, args: any) => {
    const request = args?.request;
    if (!request) return jsonResponse(404, { error: "Not found." });

    const authorization = requestHeader(request.headers, "authorization");
    const bearer = /^Bearer\s+(.+)$/i.exec(authorization);
    const token = bearer?.[1]?.trim() ?? "";
    if (!/^bookie_[0-9a-f]{48}$/.test(token)) {
      return jsonResponse(401, { error: "Missing or invalid Bookie token." });
    }

    const tokenHash = await hashExtensionToken(token);
    const credential = await ctx.runQuery(
      api.backend.functions.extensionCredentialByHash,
      { tokenHash },
    );
    if (!credential) {
      return jsonResponse(401, { error: "Missing or invalid Bookie token." });
    }

    const body = requestBody(request) as any;
    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 500) : "";
    const authors = Array.isArray(body?.authors)
      ? body.authors
          .filter((author: unknown) => typeof author === "string")
          .map((author: string) => author.trim().slice(0, 200))
          .filter(Boolean)
          .slice(0, 20)
      : [];
    const isbn10 = normalizeIsbn(body?.isbn10);
    const isbn13 = normalizeIsbn(body?.isbn13);
    const allowedStatuses = new Set(["want", "reading", "read", "unfinished"]);
    const status = allowedStatuses.has(body?.status) ? body.status : "want";
    if (!title) return jsonResponse(400, { error: "A book title is required." });

    let book: BookMetadata | undefined;
    try {
      const searchTerm = isbn13 || isbn10 || [title, authors[0]].filter(Boolean).join(" ");
      let results = await fetchLiteralBooks(ctx.env.LITERAL_TOKEN, searchTerm);
      book = selectLiteralMatch(results, { title, authors, isbn10, isbn13 });
      if (!book && (isbn13 || isbn10)) {
        results = await fetchLiteralBooks(
          ctx.env.LITERAL_TOKEN,
          [title, authors[0]].filter(Boolean).join(" "),
        );
        book = selectLiteralMatch(results, { title, authors, isbn10, isbn13 });
      }
      if (!book) {
        return jsonResponse(404, {
          error: "Bookie could not confidently match this page to a literal.club book.",
        });
      }
    } catch (error) {
      console.error("Extension import failed:", error);
      return jsonResponse(502, { error: "Bookie could not reach literal.club." });
    }

    try {
      await ctx.runMutation(api.backend.functions.queueExtensionImport, {
        member: credential.member,
        book,
        status,
      });
    } catch (error) {
      console.error("Extension import queue failed:", error);
      return jsonResponse(500, {
        error: "Bookie matched the book but could not queue the import.",
      });
    }
    return jsonResponse(202, {
      book: {
        literalId: book.literalId,
        title: book.title,
        authors: book.authors,
        coverUrl: book.coverUrl,
      },
      status,
      queued: true,
    });
  },
});

// Public actions have no member context, so they may only write the shared
// handoff. The authenticated member UI is the sole path from here into the
// member-scoped shelving and activity tables.
export const queueExtensionImport = mutation({
  args: {
    member: v.string(),
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
  handler: async (ctx, { member, book, status }) => {
    const bookId = await upsertBook(ctx, book);
    const existing = await ctx.db
      .query("extensionImports")
      .withIndex("by_member_bookId", (q: any) =>
        q.eq("member", member).eq("bookId", bookId),
      )
      .first();
    const value = { member, bookId, status, createdAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, value);
      return;
    }

    const pending = await ctx.db
      .query("extensionImports")
      .withIndex("by_member", (q: any) => q.eq("member", member))
      .collect();
    if (pending.length >= 100) {
      pending.sort((a: any, b: any) => a.createdAt - b.createdAt);
      await ctx.db.delete(pending[0]._id);
    }
    await ctx.db.insert("extensionImports", value);
  },
});

async function addBookToShelf(
  ctx: { db: any },
  caller: string,
  book: BookMetadata,
  status: "want" | "reading" | "read" | "unfinished",
) {
  const bookId = await upsertBook(ctx, book);

  const existing = await ctx.db
    .query("shelvings")
    .withIndex("by_bookId", (q: any) => q.eq("bookId", bookId))
    .first();

  const now = Date.now();
  if (existing) {
    const patch = {
      status,
      updatedAt: now,
      ...(status === "reading" && !existing.startedAt ? { startedAt: now } : {}),
      ...(status === "read" && !existing.finishedAt ? { finishedAt: now } : {}),
    };
    await ctx.db.patch(existing._id, patch);
    await upsertPublicShelving(ctx, caller, { ...existing, ...patch });
    await recordShelfTransition(ctx, bookId, existing.status, status, now);
  } else {
    const shelvingId = await ctx.db.insert("shelvings", {
      bookId,
      status,
      updatedAt: now,
      ...(status === "reading" ? { startedAt: now } : {}),
      ...(status === "read" ? { finishedAt: now } : {}),
    });
    const shelving = await ctx.db.get(shelvingId);
    await upsertPublicShelving(ctx, caller, shelving);
    await recordShelfTransition(ctx, bookId, undefined, status, now);
  }
  return bookId;
}

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
    return await addBookToShelf(ctx, caller, book, status);
  },
});

export const claimExtensionImports = mutation({
  args: { caller: v.string() },
  handler: async (ctx, { caller }) => {
    const pending = await ctx.db
      .query("extensionImports")
      .withIndex("by_member", (q: any) => q.eq("member", caller))
      .collect();
    pending.sort((a: any, b: any) => a.createdAt - b.createdAt);

    let claimed = 0;
    for (const item of pending.slice(0, 25)) {
      const book = await ctx.db.get(item.bookId);
      if (book) {
        await addBookToShelf(ctx, caller, book, item.status);
        claimed += 1;
      }
      await ctx.db.delete(item._id);
    }
    return { claimed, remaining: Math.max(0, pending.length - 25) };
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
      const shelvingId = await ctx.db.insert("shelvings", {
        bookId,
        status,
        updatedAt: now,
        ...(status === "reading" ? { startedAt: now } : {}),
        ...(status === "read" ? { finishedAt: now } : {}),
        ...(progressPercent !== undefined
          ? { progressPercent: Math.max(0, Math.min(100, progressPercent)) }
          : {}),
      });
      const shelving = await ctx.db.get(shelvingId);
      await upsertPublicShelving(ctx, caller, shelving);
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
    await upsertPublicShelving(ctx, caller, { ...existing, ...patch });
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
      const publicShelving = await ctx.db
        .query("publicShelvings")
        .withIndex("by_handle_bookId", (q: any) =>
          q.eq("handle", caller).eq("bookId", bookId),
        )
        .first();
      if (publicShelving) await ctx.db.delete(publicShelving._id);
      await recordShelfTransition(ctx, bookId, existing.status, undefined, now);
    }
  },
});

export const syncPublicShelf = mutation({
  args: { caller: v.string() },
  handler: async (ctx, { caller }) => {
    const privateRows = await ctx.db.query("shelvings").collect();
    const publicRows = await ctx.db
      .query("publicShelvings")
      .withIndex("by_handle", (q: any) => q.eq("handle", caller))
      .collect();
    const privateBookIds = new Set(
      privateRows.map((row: any) => row.bookId as unknown as string),
    );

    for (const row of privateRows) {
      await upsertPublicShelving(ctx, caller, row);
    }
    for (const row of publicRows) {
      if (!privateBookIds.has(row.bookId as unknown as string)) {
        await ctx.db.delete(row._id);
      }
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

export const publicShelf = query({
  args: {
    handle: v.string(),
    status: v.optional(
      v.union(
        v.literal("want"),
        v.literal("reading"),
        v.literal("read"),
        v.literal("unfinished"),
      ),
    ),
  },
  handler: async (ctx, { handle, status }) => {
    const shelvings = status
      ? await ctx.db
          .query("publicShelvings")
          .withIndex("by_handle_status", (q: any) =>
            q.eq("handle", handle).eq("status", status),
          )
          .collect()
      : await ctx.db
          .query("publicShelvings")
          .withIndex("by_handle", (q: any) => q.eq("handle", handle))
          .collect();

    const rows = [];
    for (const shelving of shelvings) {
      const book = await ctx.db.get(shelving.bookId);
      if (book) rows.push({ book, shelving });
    }
    return rows;
  },
});

export const memberPreferences = query({
  // Global dispatch currently validates the bridge's argument envelope as an
  // app field, while channel dispatch unwraps it. Accepting an optional empty
  // envelope keeps this no-argument query callable from both entrypoints.
  args: {
    caller: v.string(),
    args: v.optional(v.object({})),
  },
  handler: async (ctx) => {
    const preferences = await ctx.db.query("memberPreferences").first();
    return {
      shelfDisplay: preferences?.shelfDisplay ?? "details",
    };
  },
});

export const setShelfDisplay = mutation({
  args: {
    caller: v.string(),
    shelfDisplay: v.optional(v.union(v.literal("details"), v.literal("covers"))),
    args: v.optional(
      v.object({
        shelfDisplay: v.union(v.literal("details"), v.literal("covers")),
      }),
    ),
  },
  handler: async (ctx, { shelfDisplay, args }) => {
    const nextShelfDisplay = shelfDisplay ?? args?.shelfDisplay;
    if (!nextShelfDisplay) {
      throw new Error("A shelf display preference is required.");
    }
    const preferences = await ctx.db.query("memberPreferences").first();
    if (preferences) {
      await ctx.db.patch(preferences._id, { shelfDisplay: nextShelfDisplay });
    } else {
      await ctx.db.insert("memberPreferences", { shelfDisplay: nextShelfDisplay });
    }
    return { shelfDisplay: nextShelfDisplay };
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
