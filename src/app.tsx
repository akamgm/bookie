import { useEffect, useMemo, useState } from "react";
import {
  useAppContext,
  useQuery,
  useMutation,
  useAction,
  useStagePath,
  useAppPath,
  useMember,
  useMentionCandidates,
  Avatar,
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
  status: "want" | "reading" | "read" | "unfinished";
  progressPercent?: number;
};

type ShelfActivity = {
  _id: string;
  fromStatus?: Shelving["status"];
  toStatus?: Shelving["status"];
  occurredAt: number;
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
type ShelfFilter = "all" | Shelving["status"];
type DiscoverSearch = {
  query: string;
  strictAuthor?: string;
};

type Review = {
  _id: string;
  rating: number;
  body?: string;
};

type View =
  | { tab: "discover"; query?: string }
  | { tab: "shelves" }
  | { tab: "users" }
  | { tab: "user"; handle: string }
  | { tab: "detail"; bookId: string };

const STATUS_LABEL: Record<Shelving["status"], string> = {
  want: "Want to read",
  reading: "Reading",
  read: "Read",
  unfinished: "Haven't finished",
};

const SHELF_STATUSES = ["want", "reading", "read", "unfinished"] as const;

export default function App() {
  const context = useAppContext();
  const [discoverSearch, setDiscoverSearch] = useState<DiscoverSearch | undefined>();
  const [shelfFilter, setShelfFilter] = useState<ShelfFilter>("all");
  const [shelfSort, setShelfSort] = useState<ShelfSort>("updated");
  const syncPublicShelf = useMutation("syncPublicShelf");

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

  useEffect(() => {
    if (context) {
      syncPublicShelf({}).catch((err) => {
        console.error("Failed to synchronize public shelf:", err);
      });
    }
  }, [context?.handle]);

  // Deep-link a book's detail view via /book/:id, so chat posts can jump
  // straight to a specific book instead of always landing on Discover.
  const nav: any = useAppPath();
  const path: string = (nav && nav.path) || "/";
  const bookMatch = /^\/book\/([^/]+)/.exec(path);
  const userMatch = /^\/users\/([^/]+)$/.exec(path);
  const validBookId =
    bookMatch && bookMatch[1] && bookMatch[1] !== "undefined"
      ? bookMatch[1]
      : undefined;
  let selectedHandle: string | undefined;
  if (userMatch?.[1]) {
    try {
      selectedHandle = decodeURIComponent(userMatch[1]);
    } catch {
      selectedHandle = undefined;
    }
  }
  const view: View = validBookId
    ? { tab: "detail", bookId: validBookId }
    : selectedHandle
      ? { tab: "user", handle: selectedHandle }
      : path === "/users"
        ? { tab: "users" }
    : path === "/shelves"
      ? { tab: "shelves" }
      : { tab: "discover", query: discoverSearch?.query };

  useEffect(() => {
    // A malformed or stale URL (e.g. "/book/undefined") must not wedge the
    // app in a permanent bad-query loop — fall back to Discover instead of
    // trusting the path segment as a real id.
    if (bookMatch && !validBookId && nav && nav.replace) {
      nav.replace("/");
    }
  }, [path, validBookId]);

  function openPath(targetPath: string) {
    if (nav && nav.push && path !== targetPath) {
      nav.push(targetPath);
    }
  }

  if (!context) {
    return (
      <main style={styles.shell}>
        <div style={styles.connecting}>Opening the workspace…</div>
      </main>
    );
  }

  return (
    <main style={styles.shell}>
      {(view.tab === "discover" || view.tab === "shelves" || view.tab === "users") && (
        <nav style={styles.tabs}>
          <TabButton
            active={view.tab === "discover"}
            onClick={() => {
              setDiscoverSearch(undefined);
              openPath("/");
            }}
          >
            Discover
          </TabButton>
          <TabButton
            active={view.tab === "shelves"}
            onClick={() => openPath("/shelves")}
          >
            Shelves
          </TabButton>
          <TabButton
            active={view.tab === "users"}
            onClick={() => openPath("/users")}
          >
            Users
          </TabButton>
        </nav>
      )}

      {view.tab === "discover" && (
        <Discover
          initialQuery={view.query}
          strictAuthor={discoverSearch?.strictAuthor}
          onOpenBook={(bookId) => openPath(`/book/${bookId}`)}
        />
      )}
      {view.tab === "shelves" && (
        <Shelves
          filter={shelfFilter}
          sort={shelfSort}
          onFilterChange={setShelfFilter}
          onSortChange={setShelfSort}
          onOpenBook={(bookId) => openPath(`/book/${bookId}`)}
        />
      )}
      {view.tab === "users" && (
        <Users
          onOpenUser={(handle) => openPath(`/users/${encodeURIComponent(handle)}`)}
        />
      )}
      {view.tab === "user" && (
        <UserShelf
          handle={view.handle}
          onOpenBook={(bookId) => openPath(`/book/${bookId}`)}
          onBack={() => {
            if (nav && nav.back) {
              nav.back("/users");
            } else if (nav && nav.replace) {
              nav.replace("/users");
            }
          }}
        />
      )}
      {view.tab === "detail" && (
        <BookDetail
          bookId={view.bookId}
          onBack={() => {
            if (nav && nav.back) {
              nav.back("/shelves");
            } else if (nav && nav.replace) {
              nav.replace("/shelves");
            }
          }}
          onSearchAuthor={(author) => {
            setDiscoverSearch({ query: author, strictAuthor: author });
            openPath("/");
          }}
        />
      )}
    </main>
  );
}

function Users({ onOpenUser }: { onOpenUser: (handle: string) => void }) {
  const candidates = useMentionCandidates("") as Array<{
    handle: string;
    displayName: string;
    pictureUrl?: string;
    kind?: string;
  }>;
  const users = candidates.filter((member) => member.kind !== "app");

  return (
    <div style={styles.panel}>
      <div style={styles.pageIntro}>
        See what other readers have on their shelves.
      </div>
      {users.length === 0 && (
        <div style={styles.emptyState}>No users found in this channel.</div>
      )}
      <div style={styles.list}>
        {users.map((member) => (
          <button
            type="button"
            key={member.handle}
            onClick={() => onOpenUser(member.handle)}
            style={styles.userButton}
          >
            <Avatar
              handle={member.handle}
              size={40}
              pictureUrl={member.pictureUrl}
            />
            <div style={{ minWidth: 0, textAlign: "left" }}>
              <div style={styles.cardTitle}>{member.displayName}</div>
              <div style={styles.mutedText}>@{member.handle}</div>
            </div>
            <span style={styles.userChevron}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function UserShelf({
  handle,
  onBack,
  onOpenBook,
}: {
  handle: string;
  onBack: () => void;
  onOpenBook: (bookId: string) => void;
}) {
  const context = useAppContext();
  const member = useMember(handle) as
    | {
        handle: string;
        displayName: string;
        pictureUrl?: string;
      }
    | null;
  const [filter, setFilter] = useState<ShelfFilter>("all");
  const [sort, setSort] = useState<ShelfSort>("updated");
  const rows = useQuery(
    "publicShelf",
    context ? { handle, status: filter === "all" ? undefined : filter } : "skip",
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
      <BackBar onBack={onBack} label="Users" />
      <div style={styles.userHeader}>
        <Avatar handle={handle} size={48} pictureUrl={member?.pictureUrl} />
        <div style={{ minWidth: 0 }}>
          <div style={styles.detailTitle}>{member?.displayName ?? `@${handle}`}</div>
          {member && <div style={styles.mutedText}>@{handle}</div>}
        </div>
      </div>
      <div style={styles.shelfToolbar}>
        <div style={styles.filterRow}>
          {(["all", ...SHELF_STATUSES] as const).map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => setFilter(item)}
              style={{
                ...styles.pillButton,
                ...(filter === item ? styles.pillButtonActive : {}),
              }}
            >
              {item === "all" ? "All" : STATUS_LABEL[item]}
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
          {filter === "all"
            ? "This user hasn't added any books yet."
            : `No books marked ${STATUS_LABEL[filter].toLowerCase()}.`}
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
                <div style={styles.publicShelfStatus}>
                  {STATUS_LABEL[row.shelving.status]}
                  {row.shelving.status === "reading" &&
                    row.shelving.progressPercent !== undefined &&
                    ` · ${row.shelving.progressPercent}%`}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
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
        {SHELF_STATUSES.map((s) => {
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
  strictAuthor,
  onOpenBook,
}: {
  initialQuery?: string;
  strictAuthor?: string;
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

  async function searchFor(query: string, exactAuthor?: string) {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const r = await search({
        query: query.trim(),
        ...(exactAuthor ? { strictAuthor: exactAuthor } : {}),
      });
      setResults(r as SearchHit[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialQuery) {
      void searchFor(initialQuery, strictAuthor);
    }
  }, [initialQuery, strictAuthor]);

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
                {SHELF_STATUSES.map((s) => {
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

function Shelves({
  filter,
  sort,
  onFilterChange,
  onSortChange,
  onOpenBook,
}: {
  filter: ShelfFilter;
  sort: ShelfSort;
  onFilterChange: (filter: ShelfFilter) => void;
  onSortChange: (sort: ShelfSort) => void;
  onOpenBook: (bookId: string) => void;
}) {
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
          {(["all", ...SHELF_STATUSES] as const).map((f) => (
            <button
              key={f}
              onClick={() => onFilterChange(f)}
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
            onChange={(event) => onSortChange(event.target.value as ShelfSort)}
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
        note: string | null;
        avgRating: number | null;
        ratingCount: number;
      }
    | null
    | undefined;
  const rateBook = useMutation("rateBook");
  const saveBookNote = useMutation("saveBookNote");
  const shareFinishedToChat = useMutation("shareFinishedToChat");
  const activity = useQuery(
    "myBookActivity",
    context ? { bookId } : "skip",
  ) as Array<ShelfActivity & { book: Book }> | undefined;
  const [myRating, setMyRating] = useState(0);
  const [myReview, setMyReview] = useState("");
  const [savedRating, setSavedRating] = useState(false);
  const [myNote, setMyNote] = useState("");
  const [noteStatus, setNoteStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [noteError, setNoteError] = useState<string | null>(null);

  useEffect(() => {
    if (detail !== undefined && detail !== null) {
      setMyNote(detail.note ?? "");
      setNoteStatus("idle");
      setNoteError(null);
    }
  }, [bookId, detail?.note]);

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

  async function saveNote() {
    if (noteStatus === "saving") return;
    setNoteStatus("saving");
    setNoteError(null);
    try {
      await saveBookNote({ bookId, body: myNote });
      setNoteStatus("saved");
    } catch (err) {
      setNoteStatus("idle");
      setNoteError(err instanceof Error ? err.message : "Couldn't save your note.");
    }
  }

  return (
    <div style={{ ...styles.panel, ...styles.detailPanel }}>
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

      <Section title="Private note">
        <div style={styles.privateHint}>Only you can see this.</div>
        <textarea
          aria-label="Private note"
          placeholder="Why do you want to read this? Anything you want to remember?"
          value={myNote}
          maxLength={5000}
          onChange={(e) => {
            setMyNote(e.target.value);
            setNoteStatus("idle");
            setNoteError(null);
          }}
          style={styles.textarea}
          rows={4}
        />
        <div style={styles.noteActions}>
          <button
            style={{
              ...styles.primaryButton,
              ...(noteStatus === "saving" ? styles.buttonDisabled : {}),
            }}
            disabled={noteStatus === "saving"}
            onClick={saveNote}
          >
            {noteStatus === "saving" ? "Saving…" : "Save note"}
          </button>
          {noteStatus === "saved" && <span style={styles.mutedText}>Saved.</span>}
        </div>
        {noteError && <div style={styles.errorBox}>{noteError}</div>}
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

      <details style={styles.activityDisclosure}>
        <summary style={styles.activitySummary}>
          Activity{activity ? ` (${activity.length})` : ""}
        </summary>
        <div style={styles.activityContent}>
          {activity === undefined && <div style={styles.mutedText}>Loading…</div>}
          {activity && activity.length === 0 && (
            <div style={styles.mutedText}>Shelf changes will appear here.</div>
          )}
          {activity && activity.length > 0 && (
            <div style={styles.activityList}>
              {activity.map((event) => (
                <div key={event._id} style={styles.activityRow}>
                  <div style={styles.activityDot} />
                  <div>
                    <div style={styles.activityText}>{describeActivity(event)}</div>
                    <div style={styles.mutedText}>
                      {new Date(event.occurredAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

    </div>
  );
}

function describeActivity(event: ShelfActivity): string {
  if (!event.fromStatus && event.toStatus) {
    return `Added to ${STATUS_LABEL[event.toStatus]}`;
  }
  if (event.fromStatus && !event.toStatus) {
    return `Removed from ${STATUS_LABEL[event.fromStatus]}`;
  }
  if (event.fromStatus && event.toStatus) {
    return `Moved from ${STATUS_LABEL[event.fromStatus]} to ${STATUS_LABEL[event.toStatus]}`;
  }
  return "Shelf updated";
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
  pageIntro: {
    color: "var(--text-secondary)",
    fontSize: "var(--font-size-sm)",
    lineHeight: 1.5,
  },
  userButton: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: "var(--space-sm)",
    padding: "var(--space-sm)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--topbar-border)",
    background: "var(--app-bg)",
    color: "inherit",
    font: "inherit",
    cursor: "pointer",
  },
  userChevron: {
    marginLeft: "auto",
    color: "var(--text-muted)",
    fontSize: "var(--font-size-lg)",
  },
  userHeader: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-sm)",
    paddingBottom: "var(--space-xs)",
  },
  publicShelfStatus: {
    marginTop: "var(--space-xs)",
    color: "var(--accent)",
    fontSize: "var(--font-size-xs)",
    fontWeight: 600,
  },
  panel: {
    padding: "var(--space-md)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-sm)",
  },
  detailPanel: {
    gap: "var(--space-md)",
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
  buttonDisabled: {
    opacity: 0.65,
    cursor: "wait",
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
  activityDisclosure: {
    paddingTop: "var(--space-sm)",
    borderTop: "1px solid var(--topbar-border)",
  },
  activitySummary: {
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: "var(--font-size-xs)",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  activityContent: {
    paddingTop: "var(--space-sm)",
  },
  activityList: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-sm)",
  },
  activityRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: "var(--space-xs)",
  },
  activityDot: {
    width: 7,
    height: 7,
    marginTop: 5,
    borderRadius: 999,
    background: "var(--accent)",
    flexShrink: 0,
  },
  activityText: {
    color: "var(--text-secondary)",
    fontSize: "var(--font-size-sm)",
  },
  privateHint: {
    color: "var(--text-muted)",
    fontSize: "var(--font-size-xs)",
  },
  noteActions: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-sm)",
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
