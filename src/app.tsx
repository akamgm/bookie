import { useState } from "react";
import {
  useAppContext,
  useQuery,
  useMutation,
  useAction,
  useMember,
  Avatar,
} from "@quiver/react";

type SearchResult = {
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

type Book = SearchResult & { _id: string };

type Shelving = {
  handle: string;
  status: "want" | "reading" | "read";
  progressPercent?: number;
};

type ShelfRow = {
  book: Book;
  shelvings: Shelving[];
  avgRating: number | null;
  ratingCount: number;
};

type Review = {
  _id: string;
  handle: string;
  rating: number;
  body?: string;
};

type View =
  | { tab: "discover" }
  | { tab: "shelves" }
  | { tab: "detail"; bookId: string };

const STATUS_LABEL: Record<Shelving["status"], string> = {
  want: "Want to read",
  reading: "Reading",
  read: "Read",
};

export default function App() {
  const context = useAppContext();
  const [view, setView] = useState<View>({ tab: "discover" });

  if (!context) {
    return (
      <main style={styles.shell}>
        <div style={styles.connecting}>Opening the workspace…</div>
      </main>
    );
  }

  return (
    <main style={styles.shell}>
      {view.tab !== "detail" && (
        <nav style={styles.tabs}>
          <TabButton
            active={view.tab === "discover"}
            onClick={() => setView({ tab: "discover" })}
          >
            Discover
          </TabButton>
          <TabButton
            active={view.tab === "shelves"}
            onClick={() => setView({ tab: "shelves" })}
          >
            Shelves
          </TabButton>
        </nav>
      )}

      {view.tab === "discover" && (
        <Discover onOpenBook={(bookId) => setView({ tab: "detail", bookId })} />
      )}
      {view.tab === "shelves" && (
        <Shelves onOpenBook={(bookId) => setView({ tab: "detail", bookId })} />
      )}
      {view.tab === "detail" && (
        <BookDetail
          bookId={view.bookId}
          onBack={() => setView({ tab: "shelves" })}
        />
      )}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{ ...styles.tabButton, ...(active ? styles.tabButtonActive : {}) }}
    >
      {children}
    </button>
  );
}

function Cover({ url, title }: { url?: string; title: string }) {
  if (url) {
    return <img src={url} alt={title} style={styles.cover} />;
  }
  return (
    <div style={styles.coverFallback}>
      <span style={{ fontSize: 18 }}>📕</span>
    </div>
  );
}

function Stars({ value }: { value: number | null }) {
  if (value === null) {
    return <span style={styles.mutedText}>No ratings yet</span>;
  }
  const rounded = Math.round(value);
  return (
    <span style={{ color: "var(--accent)" }}>
      {"★".repeat(rounded)}
      <span style={{ color: "var(--text-muted)" }}>
        {"★".repeat(5 - rounded)}
      </span>{" "}
      <span style={styles.mutedText}>{value.toFixed(1)}</span>
    </span>
  );
}

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          style={styles.starButton}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          <span style={{ color: n <= value ? "var(--accent)" : "var(--text-muted)" }}>
            ★
          </span>
        </button>
      ))}
    </div>
  );
}

function ShelfControls({
  bookId,
  currentStatus,
  onChanged,
}: {
  bookId: string;
  currentStatus?: Shelving["status"];
  onChanged?: () => void;
}) {
  const updateStatus = useMutation("updateShelfStatus");
  const removeFromShelf = useMutation("removeFromShelf");

  async function pick(status: Shelving["status"]) {
    if (status === currentStatus) {
      await removeFromShelf({ bookId });
    } else {
      await updateStatus({ bookId, status });
    }
    onChanged?.();
  }

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {(["want", "reading", "read"] as const).map((s) => (
        <button
          key={s}
          onClick={() => pick(s)}
          style={{
            ...styles.pillButton,
            ...(currentStatus === s ? styles.pillButtonActive : {}),
          }}
        >
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

function Discover({ onOpenBook }: { onOpenBook: (bookId: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const search = useAction("searchBooks");
  const addToShelf = useMutation("addToShelf");
  const [addedIds, setAddedIds] = useState<Record<string, string>>({});

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const r = await search({ query: q.trim() });
      setResults(r as SearchResult[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  async function add(result: SearchResult, status: Shelving["status"]) {
    const bookId = await addToShelf({
      book: {
        literalId: result.literalId,
        title: result.title,
        subtitle: result.subtitle,
        authors: result.authors,
        coverUrl: result.coverUrl,
        isbn10: result.isbn10,
        isbn13: result.isbn13,
        pageCount: result.pageCount,
        publishedDate: result.publishedDate,
        publisher: result.publisher,
        description: result.description,
      },
      status,
    });
    setAddedIds((m) => ({ ...m, [result.literalId]: bookId as string }));
  }

  return (
    <div style={styles.panel}>
      <form onSubmit={runSearch} style={styles.searchRow}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by title or author…"
          style={styles.searchInput}
        />
        <button type="submit" style={styles.primaryButton} disabled={loading}>
          {loading ? "…" : "Search"}
        </button>
      </form>

      {error && <div style={styles.errorBox}>{error}</div>}

      {results === null && !loading && (
        <div style={styles.emptyState}>
          Search literal.club to find a book and add it to the channel's
          shelves.
        </div>
      )}

      {results !== null && results.length === 0 && !loading && (
        <div style={styles.emptyState}>No books found.</div>
      )}

      <div style={styles.list}>
        {(results ?? []).map((r) => {
          const addedBookId = addedIds[r.literalId];
          return (
            <div key={r.literalId} style={styles.card}>
              <div
                style={{ display: "flex", gap: 10, cursor: addedBookId ? "pointer" : "default" }}
                onClick={() => addedBookId && onOpenBook(addedBookId)}
              >
                <Cover url={r.coverUrl} title={r.title} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.cardTitle}>{r.title}</div>
                  {r.subtitle && <div style={styles.mutedText}>{r.subtitle}</div>}
                  <div style={styles.mutedText}>{r.authors.join(", ")}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {(["want", "reading", "read"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => add(r, s)}
                    style={styles.pillButton}
                  >
                    + {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Shelves({ onOpenBook }: { onOpenBook: (bookId: string) => void }) {
  const [filter, setFilter] = useState<"all" | Shelving["status"]>("all");
  const context = useAppContext();
  const rows = useQuery(
    "channelShelf",
    context ? { status: filter === "all" ? undefined : filter } : "skip",
  ) as ShelfRow[] | undefined;

  return (
    <div style={styles.panel}>
      <div style={styles.filterRow}>
        {(["all", "want", "reading", "read"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              ...styles.pillButton,
              ...(filter === f ? styles.pillButtonActive : {}),
            }}
          >
            {f === "all" ? "All" : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {rows === undefined && <div style={styles.emptyState}>Loading…</div>}
      {rows && rows.length === 0 && (
        <div style={styles.emptyState}>
          Nothing here yet — search Discover to add a book.
        </div>
      )}

      <div style={styles.list}>
        {(rows ?? []).map((row) => (
          <div
            key={row.book._id}
            style={{ ...styles.card, cursor: "pointer" }}
            onClick={() => onOpenBook(row.book._id)}
          >
            <div style={{ display: "flex", gap: 10 }}>
              <Cover url={row.book.coverUrl} title={row.book.title} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.cardTitle}>{row.book.title}</div>
                <div style={styles.mutedText}>{row.book.authors.join(", ")}</div>
                <div style={{ marginTop: 4 }}>
                  <Stars value={row.avgRating} />
                </div>
              </div>
            </div>
            <div style={styles.shelverRow}>
              {row.shelvings.map((s) => (
                <div key={s.handle} style={styles.shelverChip}>
                  <Avatar handle={s.handle} size={18} />
                  <span style={styles.mutedText}>{STATUS_LABEL[s.status]}</span>
                  {s.status === "reading" && s.progressPercent !== undefined && (
                    <span style={styles.mutedText}>{s.progressPercent}%</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewRow({ review }: { review: Review }) {
  const member = useMember(review.handle);
  return (
    <div style={styles.reviewRow}>
      <Avatar handle={review.handle} size={24} pictureUrl={member?.pictureUrl} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={styles.cardTitle}>{member?.displayName ?? review.handle}</span>
          <Stars value={review.rating} />
        </div>
        {review.body && <div style={styles.reviewBody}>{review.body}</div>}
      </div>
    </div>
  );
}

function BookDetail({ bookId, onBack }: { bookId: string; onBack: () => void }) {
  const context = useAppContext();
  const detail = useQuery("bookDetail", context ? { bookId } : "skip") as
    | {
        book: Book;
        shelvings: Shelving[];
        reviews: Review[];
        avgRating: number | null;
        ratingCount: number;
      }
    | null
    | undefined;
  const rateBook = useMutation("rateBook");
  const shareFinishedToChat = useMutation("shareFinishedToChat");
  const [myRating, setMyRating] = useState(0);
  const [myReview, setMyReview] = useState("");
  const [savedRating, setSavedRating] = useState(false);

  if (detail === undefined) {
    return (
      <div style={styles.panel}>
        <BackBar onBack={onBack} />
        <div style={styles.emptyState}>Loading…</div>
      </div>
    );
  }
  if (detail === null) {
    return (
      <div style={styles.panel}>
        <BackBar onBack={onBack} />
        <div style={styles.emptyState}>Book not found.</div>
      </div>
    );
  }

  const { book, shelvings, reviews, avgRating, ratingCount } = detail;
  const myHandle = context?.handle;
  const mine = shelvings.find((s) => s.handle === myHandle);
  const myExistingReview = reviews.find((r) => r.handle === myHandle);
  const otherReviews = reviews.filter((r) => r.handle !== myHandle);

  async function saveReview() {
    if (myRating < 1) return;
    await rateBook({ bookId, rating: myRating, body: myReview || undefined });
    setSavedRating(true);
  }

  return (
    <div style={styles.panel}>
      <BackBar onBack={onBack} />
      <div style={{ display: "flex", gap: 14 }}>
        <Cover url={book.coverUrl} title={book.title} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.detailTitle}>{book.title}</div>
          {book.subtitle && <div style={styles.mutedText}>{book.subtitle}</div>}
          <div style={styles.mutedText}>{book.authors.join(", ")}</div>
          <div style={{ marginTop: 6 }}>
            <Stars value={avgRating} />
            {ratingCount > 0 && (
              <span style={styles.mutedText}> ({ratingCount})</span>
            )}
          </div>
        </div>
      </div>

      {book.description && (
        <p style={styles.description}>{book.description}</p>
      )}

      <Section title="Your shelf">
        <ShelfControls bookId={bookId} currentStatus={mine?.status as any} />
        {mine?.status === "reading" && (
          <ProgressEditor bookId={bookId} value={mine.progressPercent} />
        )}
        {mine?.status === "read" && (
          <button
            style={{ ...styles.pillButton, marginTop: 8 }}
            onClick={() => shareFinishedToChat({ bookId })}
          >
            Share to channel
          </button>
        )}
      </Section>

      <Section title="Your rating">
        <StarPicker
          value={myRating || myExistingReview?.rating || 0}
          onChange={setMyRating}
        />
        <textarea
          placeholder="Write a review (optional)"
          defaultValue={myExistingReview?.body ?? ""}
          onChange={(e) => setMyReview(e.target.value)}
          style={styles.textarea}
          rows={3}
        />
        <button style={styles.primaryButton} onClick={saveReview}>
          {myExistingReview ? "Update rating" : "Save rating"}
        </button>
        {savedRating && <span style={styles.mutedText}> Saved.</span>}
      </Section>

      {otherReviews.length > 0 && (
        <Section title="Reviews">
          {otherReviews.map((r) => (
            <ReviewRow key={r._id} review={r} />
          ))}
        </Section>
      )}
    </div>
  );
}

function ProgressEditor({ bookId, value }: { bookId: string; value?: number }) {
  const updateStatus = useMutation("updateShelfStatus");
  const [pct, setPct] = useState(value ?? 0);
  return (
    <div style={{ marginTop: 8 }}>
      <input
        type="range"
        min={0}
        max={100}
        value={pct}
        onChange={(e) => setPct(Number(e.target.value))}
        onMouseUp={() => updateStatus({ bookId, progressPercent: pct })}
        onTouchEnd={() => updateStatus({ bookId, progressPercent: pct })}
        style={{ width: "100%" }}
      />
      <div style={styles.mutedText}>{pct}% through</div>
    </div>
  );
}

function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <button onClick={onBack} style={styles.backButton}>
      ← Shelves
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: "100%",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    color: "var(--text-primary)",
    fontFamily: "var(--font-sans)",
    background: "var(--app-bg)",
  },
  connecting: {
    display: "grid",
    placeItems: "center",
    minHeight: "100%",
    color: "var(--text-muted)",
    fontSize: "var(--font-size-sm)",
  },
  tabs: {
    display: "flex",
    gap: "var(--space-xs)",
    padding: "var(--space-sm) var(--space-md) 0",
  },
  tabButton: {
    flex: 1,
    padding: "var(--space-sm) 0",
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "var(--text-secondary)",
    fontSize: "var(--font-size-sm)",
    fontWeight: 600,
    cursor: "pointer",
  },
  tabButtonActive: {
    color: "var(--text-primary)",
    borderBottom: "2px solid var(--accent)",
  },
  panel: {
    padding: "var(--space-md)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-sm)",
  },
  searchRow: { display: "flex", gap: "var(--space-xs)" },
  searchInput: {
    flex: 1,
    padding: "var(--space-sm)",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--topbar-border)",
    background: "var(--app-bg)",
    color: "var(--text-primary)",
    fontSize: "var(--font-size-sm)",
  },
  primaryButton: {
    padding: "var(--space-sm) var(--space-md)",
    borderRadius: "var(--radius-sm)",
    border: "none",
    background: "var(--accent)",
    color: "#fff",
    fontSize: "var(--font-size-sm)",
    fontWeight: 600,
    cursor: "pointer",
  },
  errorBox: {
    padding: "var(--space-sm)",
    borderRadius: "var(--radius-sm)",
    background: "color-mix(in srgb, var(--accent-red) 15%, transparent)",
    color: "var(--accent-red)",
    fontSize: "var(--font-size-sm)",
  },
  emptyState: {
    padding: "var(--space-lg) var(--space-sm)",
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "var(--font-size-sm)",
  },
  list: { display: "flex", flexDirection: "column", gap: "var(--space-sm)" },
  card: {
    padding: "var(--space-sm)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--topbar-border)",
    background: "var(--app-bg)",
  },
  cardTitle: {
    fontSize: "var(--font-size-base)",
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  detailTitle: {
    fontSize: "var(--font-size-lg)",
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  mutedText: {
    fontSize: "var(--font-size-xs)",
    color: "var(--text-muted)",
  },
  cover: {
    width: 48,
    height: 72,
    objectFit: "cover",
    borderRadius: "var(--radius-sm)",
    flexShrink: 0,
    background: "var(--topbar-border)",
  },
  coverFallback: {
    width: 48,
    height: 72,
    display: "grid",
    placeItems: "center",
    borderRadius: "var(--radius-sm)",
    background: "var(--topbar-border)",
    flexShrink: 0,
  },
  pillButton: {
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid var(--topbar-border)",
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: "var(--font-size-xs)",
    cursor: "pointer",
  },
  pillButtonActive: {
    background: "var(--accent)",
    borderColor: "var(--accent)",
    color: "#fff",
  },
  filterRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  shelverRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: "var(--space-sm)",
    paddingTop: "var(--space-sm)",
    borderTop: "1px solid var(--topbar-border)",
  },
  shelverChip: { display: "flex", alignItems: "center", gap: 4 },
  backButton: {
    alignSelf: "flex-start",
    background: "transparent",
    border: "none",
    color: "var(--accent)",
    fontSize: "var(--font-size-sm)",
    fontWeight: 600,
    cursor: "pointer",
    padding: 0,
  },
  description: {
    fontSize: "var(--font-size-sm)",
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  },
  section: {
    paddingTop: "var(--space-sm)",
    borderTop: "1px solid var(--topbar-border)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-xs)",
  },
  sectionTitle: {
    fontSize: "var(--font-size-xs)",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
  },
  starButton: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: 18,
    padding: 0,
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    padding: "var(--space-sm)",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--topbar-border)",
    background: "var(--app-bg)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--font-size-sm)",
    resize: "vertical",
  },
  reviewRow: {
    display: "flex",
    gap: "var(--space-sm)",
    paddingTop: "var(--space-xs)",
  },
  reviewBody: {
    fontSize: "var(--font-size-sm)",
    color: "var(--text-secondary)",
    marginTop: 2,
  },
};
