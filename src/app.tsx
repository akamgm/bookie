import { useEffect, useMemo, useState } from "react";
import {
  useAppContext,
  useQuery,
  useMutation,
  useAction,
  useStagePath,
  useAppPath,
} from "@quiver/react";

function panelBaseFrom(url: string): string {
  if (!url) return "";
  const match = /\/~\/c\/([^/?#]+)\/([^/?#]+)/.exec(url);
  if (!match) return "";
  return "/~/c/" + match[1] + "/" + match[2];
}

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

type SearchHit = SearchResult;

type Shelving = {
  status: "want" | "reading" | "read";
  progressPercent?: number;
};

type ShelfRow = {
  book: Book;
  shelving: Shelving & {
    dateAdded: number;
    updatedAt: number;
  };
  avgRating: number | null;
  ratingCount: number;
};

type ShelfSort = "updated" | "added" | "title" | "author";

type Review = {
  _id: string;
  rating: number;
  body?: string;
};

type View =
  | { tab: "discover"; query?: string }
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

  // Record panel base so the backend can generate links back to this channel's app instance.
  const staged: any = useStagePath();
  const recordPanelBase = useMutation("recordPanelBase");
  const fromStage = typeof staged === "string" ? staged : staged && staged.path ? staged.path : "";
  const referrer = typeof document === "undefined" ? "" : document.referrer;
  const base = panelBaseFrom(fromStage) || panelBaseFrom(referrer);

  useEffect(() => {
    if (base) {
      recordPanelBase({ base }).catch((err) => {
        console.error("Failed to record panel base:", err);
      });
    }
  }, [base]);

  // Deep-link a book's detail view via /book/:id, so chat posts can jump
  // straight to a specific book instead of always landing on Discover.
  const nav: any = useAppPath();
  const path: string = (nav && nav.path) || "/";

  useEffect(() => {
    if (nav && nav.push) {
      const targetPath = view.tab === "detail" ? `/book/${view.bookId}` : "/";
      if (path !== targetPath) {
        nav.push(targetPath);
      }
    }
  }, [view]);

  useEffect(() => {
    const bookMatch = /^\/book\/([^/]+)/.exec(path);
    // A malformed or stale URL (e.g. "/book/undefined") must not wedge the
    // app in a permanent bad-query loop — fall back to Discover instead of
    // trusting the path segment as a real id.
    if (bookMatch && bookMatch[1] && bookMatch[1] !== "undefined") {
      const bookId = bookMatch[1];
      if (!(view.tab === "detail" && view.bookId === bookId)) {
        setView({ tab: "detail", bookId });
      }
    } else if (bookMatch && nav && nav.replace) {
      nav.replace("/");
      if (view.tab === "detail") setView({ tab: "discover" });
    } else if (path === "/" && view.tab === "detail") {
      setView({ tab: "discover" });
    }
  }, [path]);

  if (!context) {
    return (
      <main style={styles.shell}>
        <div style={styles.connecting}>Opening the workspace…</div>
      </main>
    );
  }

  return (
    <main style={styles.shell}>
      {(view.tab === "discover" || view.tab === "shelves") && (
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
        <Discover
          initialQuery={view.query}
          onOpenBook={(bookId) => setView({ tab: "detail", bookId })}
        />
      )}
      {view.tab === "shelves" && (
        <Shelves onOpenBook={(bookId) => setView({ tab: "detail", bookId })} />
      )}
      {view.tab === "detail" && (
        <BookDetail
          bookId={view.bookId}
          onBack={() => setView({ tab: "shelves" })}
          onSearchAuthor={(author) => setView({ tab: "discover", query: author })}
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
  const [selectedStatus, setSelectedStatus] = useState<Shelving["status"] | undefined>(
    currentStatus,
  );
  const [pendingStatus, setPendingStatus] = useState<Shelving["status"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedStatus(currentStatus);
  }, [currentStatus]);

  async function pick(status: Shelving["status"]) {
    if (pendingStatus) return;

    const previousStatus = selectedStatus;
    const nextStatus = status === selectedStatus ? undefined : status;
    setPendingStatus(status);
    setError(null);
    setSelectedStatus(nextStatus);

    try {
      if (nextStatus === undefined) {
        await removeFromShelf({ bookId });
      } else {
        await updateStatus({ bookId, status: nextStatus });
      }
      onChanged?.();
    } catch (err) {
      setSelectedStatus(previousStatus);
      setError(err instanceof Error ? err.message : "Couldn't update your shelf.");
    } finally {
      setPendingStatus(null);
    }
  }

  return (
    <>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(["want", "reading", "read"] as const).map((s) => {
          const isSelected = selectedStatus === s;
          const isPending = pendingStatus === s;
          return (
            <button
              type="button"
              key={s}
              aria-pressed={isSelected}
              disabled={pendingStatus !== null}
              onClick={() => void pick(s)}
              style={{
                ...styles.pillButton,
                ...(isSelected ? styles.pillButtonActive : {}),
                ...(isPending ? styles.pillButtonPending : {}),
                ...(pendingStatus && !isPending ? styles.pillButtonDisabled : {}),
              }}
            >
              {isPending
                ? (isSelected ? "Saving…" : "Removing…")
                : isSelected ? `✓ ${STATUS_LABEL[s]}` : STATUS_LABEL[s]}
            </button>
          );
        })}
      </div>
      {error && <div style={styles.errorBox}>{error}</div>}
    </>
  );
}

function Discover({
  initialQuery,
  onOpenBook,
}: {
  initialQuery?: string;
  onOpenBook: (bookId: string) => void;
}) {
  const [q, setQ] = useState(initialQuery ?? "");
  const [results, setResults] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const search = useAction("searchBooks");
  const cacheBookDetails = useMutation("cacheBookDetails");
  const addToShelf = useMutation("addToShelf");
  const removeFromShelf = useMutation("removeFromShelf");
  const [addedStatus, setAddedStatus] = useState<Record<string, Shelving["status"]>>({});
  const [bookIds, setBookIds] = useState<Record<string, string>>({});
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});

  async function searchFor(query: string) {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const r = await search({ query: query.trim() });
      setResults(r as SearchHit[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialQuery) {
      void searchFor(initialQuery);
    }
  }, [initialQuery]);

  function runSearch(e: React.FormEvent) {
    e.preventDefault();
    void searchFor(q);
  }

  async function openBook(result: SearchHit) {
    if (openingId) return;
    setOpeningId(result.literalId);
    setAddErrors((m) => {
      const { [result.literalId]: _removed, ...rest } = m;
      return rest;
    });
    try {
      const bookId = (await cacheBookDetails({ book: result })) as string;
      setBookIds((m) => ({ ...m, [result.literalId]: bookId }));
      onOpenBook(bookId);
    } catch (err) {
      setAddErrors((m) => ({
        ...m,
        [result.literalId]:
          err instanceof Error ? err.message : "Couldn't open book details.",
      }));
    } finally {
      setOpeningId((id) => (id === result.literalId ? null : id));
    }
  }

  async function toggleStatus(result: SearchHit, status: Shelving["status"]) {
    const key = `${result.literalId}:${status}`;
    const isActive = addedStatus[result.literalId] === status;

    setPendingKey(key);
    setAddErrors((m) => {
      const { [result.literalId]: _removed, ...rest } = m;
      return rest;
    });
    try {
      if (isActive) {
        const bookId = bookIds[result.literalId];
        if (!bookId) throw new Error("Book cache was unavailable.");
        await removeFromShelf({ bookId });
        setAddedStatus((m) => {
          const { [result.literalId]: _removed, ...rest } = m;
          return rest;
        });
      } else {
        const bookId = (await addToShelf({
          book: result,
          status,
        })) as string;
        setBookIds((m) => ({ ...m, [result.literalId]: bookId }));
        setAddedStatus((m) => ({ ...m, [result.literalId]: status }));
      }
    } catch (err) {
      setAddErrors((m) => ({
        ...m,
        [result.literalId]: err instanceof Error ? err.message : "Couldn't update shelf.",
      }));
    } finally {
      setPendingKey((k) => (k === key ? null : k));
    }
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
          Search literal.club to find a book and add it to your library.
        </div>
      )}

      {results !== null && results.length === 0 && !loading && (
        <div style={styles.emptyState}>No books found.</div>
      )}

      <div style={styles.list}>
        {(results ?? []).map((r) => {
          const currentStatus = addedStatus[r.literalId];
          const isPendingThisBook =
            (pendingKey?.startsWith(`${r.literalId}:`) ?? false) ||
            openingId === r.literalId;
          const error = addErrors[r.literalId];
          return (
            <div key={r.literalId} style={styles.card}>
              <button
                type="button"
                style={styles.bookResultButton}
                onClick={() => void openBook(r)}
                disabled={openingId !== null}
              >
                <Cover url={r.coverUrl} title={r.title} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.cardTitle}>{r.title}</div>
                  {r.subtitle && <div style={styles.mutedText}>{r.subtitle}</div>}
                  <div style={styles.mutedText}>{r.authors.join(", ")}</div>
                </div>
              </button>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {(["want", "reading", "read"] as const).map((s) => {
                  const key = `${r.literalId}:${s}`;
                  const isPending = pendingKey === key;
                  const isAdded = currentStatus === s;
                  return (
                    <button
                      key={s}
                      onClick={() => toggleStatus(r, s)}
                      disabled={isPendingThisBook}
                      style={{
                        ...styles.pillButton,
                        ...(isAdded ? styles.pillButtonActive : {}),
                        ...(isPending ? styles.pillButtonPending : {}),
                        ...(isPendingThisBook && !isPending ? styles.pillButtonDisabled : {}),
                      }}
                    >
                      {isPending
                        ? (isAdded ? "Removing…" : "Adding…")
                        : isAdded ? `✓ ${STATUS_LABEL[s]}` : `+ ${STATUS_LABEL[s]}`}
                    </button>
                  );
                })}
              </div>
              {error && <div style={styles.errorBox}>{error}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Shelves({ onOpenBook }: { onOpenBook: (bookId: string) => void }) {
  const [filter, setFilter] = useState<"all" | Shelving["status"]>("all");
  const [sort, setSort] = useState<ShelfSort>("updated");
  const context = useAppContext();
  const rows = useQuery(
    "channelShelf",
    context ? { status: filter === "all" ? undefined : filter } : "skip",
  ) as ShelfRow[] | undefined;
  const sortedRows = useMemo(() => {
    const compareText = (a: string, b: string) =>
      a.localeCompare(b, undefined, { sensitivity: "base" });

    return [...(rows ?? [])].sort((a, b) => {
      let comparison = 0;
      if (sort === "updated") {
        comparison = b.shelving.updatedAt - a.shelving.updatedAt;
      } else if (sort === "added") {
        comparison = b.shelving.dateAdded - a.shelving.dateAdded;
      } else if (sort === "title") {
        comparison = compareText(a.book.title, b.book.title);
      } else {
        comparison = compareText(a.book.authors[0] ?? "", b.book.authors[0] ?? "");
      }

      return (
        comparison ||
        compareText(a.book.title, b.book.title) ||
        compareText(a.book._id, b.book._id)
      );
    });
  }, [rows, sort]);

  return (
    <div style={styles.panel}>
      <div style={styles.shelfToolbar}>
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
        <label style={styles.sortControl}>
          <span style={styles.sortLabel}>Sort by</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as ShelfSort)}
            style={styles.sortSelect}
          >
            <option value="updated">Most recently updated</option>
            <option value="added">Date added</option>
            <option value="title">Book title</option>
            <option value="author">Author name</option>
          </select>
        </label>
      </div>

      {rows === undefined && <div style={styles.emptyState}>Loading…</div>}
      {rows && rows.length === 0 && (
        <div style={styles.emptyState}>
          Nothing here yet — search Discover to add a book.
        </div>
      )}

      <div style={styles.list}>
        {sortedRows.map((row) => (
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
              <div style={styles.shelverChip}>
                <span style={styles.mutedText}>
                  {STATUS_LABEL[row.shelving.status]}
                </span>
                {row.shelving.status === "reading" &&
                  row.shelving.progressPercent !== undefined && (
                    <span style={styles.mutedText}>
                      {row.shelving.progressPercent}%
                    </span>
                  )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BookDetail({
  bookId,
  onBack,
  onSearchAuthor,
}: {
  bookId: string;
  onBack: () => void;
  onSearchAuthor: (author: string) => void;
}) {
  const context = useAppContext();
  const detail = useQuery("bookDetail", context ? { bookId } : "skip") as
    | {
        book: Book;
        shelving: Shelving | null;
        review: Review | null;
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

  const {
    book,
    shelving: mine,
    review: myExistingReview,
    avgRating,
    ratingCount,
  } = detail;

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
          <div style={styles.mutedText}>
            {book.authors.map((author, index) => (
              <span key={author}>
                {index > 0 && ", "}
                <button
                  type="button"
                  onClick={() => onSearchAuthor(author)}
                  style={styles.authorLink}
                >
                  {author}
                </button>
              </span>
            ))}
          </div>
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

function BackBar({ onBack, label = "Shelves" }: { onBack: () => void; label?: string }) {
  return (
    <button onClick={onBack} style={styles.backButton}>
      ← {label}
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
  authorLink: {
    padding: 0,
    border: "none",
    background: "transparent",
    color: "inherit",
    font: "inherit",
    textDecoration: "underline",
    cursor: "pointer",
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
  bookResultButton: {
    width: "100%",
    display: "flex",
    gap: 10,
    padding: 0,
    border: "none",
    background: "transparent",
    color: "inherit",
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
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
  pillButtonDisabled: {
    opacity: 0.5,
    cursor: "default",
  },
  pillButtonPending: {
    opacity: 0.7,
    cursor: "wait",
  },
  shelfToolbar: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "var(--space-sm)",
  },
  filterRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  sortControl: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-xs)",
  },
  sortLabel: {
    color: "var(--text-muted)",
    fontSize: "var(--font-size-xs)",
    whiteSpace: "nowrap",
  },
  sortSelect: {
    padding: "4px 28px 4px 8px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--topbar-border)",
    background: "var(--app-bg)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--font-size-xs)",
    cursor: "pointer",
  },
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
