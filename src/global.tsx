import { useEffect, useState } from "react";
import { useAppContext, useMutation, useQuery } from "@quiver/react";

type ShelfDisplay = "details" | "covers";
type TransferEntry = {
  book: { literalId: string; title: string };
  activity: unknown[];
};
type LibraryFile = { version: number; books: TransferEntry[] };

const OPTIONS: Array<{
  value: ShelfDisplay;
  title: string;
  description: string;
}> = [
  {
    value: "details",
    title: "Cards with details",
    description: "Show each cover alongside its title, author, rating, and shelf status.",
  },
  {
    value: "covers",
    title: "Covers only",
    description: "Show a compact cover grid and reveal book details on hover or focus.",
  },
];

export default function GlobalSettings() {
  const context = useAppContext();
  const preferences = useQuery(
    "memberPreferences",
    context ? {} : "skip",
  ) as { shelfDisplay: ShelfDisplay } | undefined;
  const setShelfDisplay = useMutation("setShelfDisplay");
  const importLibrary = useMutation("importLibrary");
  const [exportRequested, setExportRequested] = useState(false);
  const exported = useQuery(
    "exportLibrary",
    context && exportRequested ? {} : "skip",
  ) as LibraryFile | undefined;
  const [file, setFile] = useState<LibraryFile | null>(null);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState<ShelfDisplay | null>(null);
  const [error, setError] = useState("");
  const selected = preferences?.shelfDisplay ?? "details";

  useEffect(() => {
    if (!exportRequested || !exported) return;
    const blob = new Blob([JSON.stringify(exported, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bookie-library-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportRequested(false);
    setMessage(`Exported ${exported.books.length} books. Keep this file private: it contains your notes and reviews.`);
  }, [exportRequested, exported]);

  async function selectFile(selected: File | undefined) {
    setFile(null);
    setFileName("");
    setMessage("");
    setError("");
    if (!selected) return;
    if (selected.size > 25 * 1024 * 1024) {
      setError("The export file is too large (25 MB maximum).");
      return;
    }
    try {
      const parsed: unknown = JSON.parse(await selected.text());
      if (!parsed || typeof parsed !== "object" ||
          (parsed as LibraryFile).version !== 1 ||
          !Array.isArray((parsed as LibraryFile).books) ||
          !(parsed as LibraryFile).books.every((entry) =>
            entry && typeof entry.book?.literalId === "string" &&
            typeof entry.book?.title === "string" &&
            Array.isArray(entry.activity) && entry.activity.length <= 500)) {
        throw new Error("Not a supported Bookie library export.");
      }
      setFile(parsed as LibraryFile);
      setFileName(selected.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read this file.");
    }
  }

  async function importFile() {
    if (!file || importing) return;
    setImporting(true);
    setError("");
    setMessage("");
    let added = 0;
    let transitions = 0;
    try {
      // Each mutation is atomic. Re-running after an interrupted transfer is
      // safe: existing destination data and previously imported events remain.
      let batch: TransferEntry[] = [];
      let events = 0;
      async function sendBatch() {
        if (!batch.length) return;
        const result = await importLibrary({ version: 1, books: batch }) as
          { added: number; transitions: number };
        added += result.added;
        transitions += result.transitions;
        batch = [];
        events = 0;
      }
      for (const entry of file.books) {
        if (batch.length === 10 || events + entry.activity.length > 500) {
          await sendBatch();
        }
        batch.push(entry);
        events += entry.activity.length;
      }
      await sendBatch();
      setMessage(`Import complete: ${added} new shelf entries and ${transitions} transitions. Existing shelf entries, reviews, and notes were kept.`);
      setFile(null);
      setFileName("");
    } catch (err) {
      setError(`${err instanceof Error ? err.message : "Import failed."} Earlier batches may have succeeded; retry the same file to finish safely.`);
    } finally {
      setImporting(false);
    }
  }

  async function choose(value: ShelfDisplay) {
    if (value === selected || saving) return;
    setSaving(value);
    setError("");
    try {
      await setShelfDisplay({ shelfDisplay: value });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this preference.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <main style={styles.shell}>
      <section style={styles.panel}>
        <div>
          <h1 style={styles.heading}>Shelf display</h1>
          <p style={styles.intro}>
            Choose how shelves appear throughout Bookie. This preference follows you
            across channels.
          </p>
        </div>

        <div role="radiogroup" aria-label="Shelf display" style={styles.options}>
          {OPTIONS.map((option) => {
            const active = selected === option.value;
            const pending = saving === option.value;
            return (
              <button
                type="button"
                role="radio"
                aria-checked={active}
                key={option.value}
                disabled={!preferences || saving !== null}
                onClick={() => void choose(option.value)}
                style={{
                  ...styles.option,
                  ...(active ? styles.optionActive : {}),
                  ...(!preferences || saving !== null ? styles.optionDisabled : {}),
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    ...styles.radio,
                    ...(active ? styles.radioActive : {}),
                  }}
                />
                <span>
                  <span style={styles.optionTitle}>
                    {option.title}
                    {pending ? " — Saving…" : ""}
                  </span>
                  <span style={styles.optionDescription}>{option.description}</span>
                </span>
              </button>
            );
          })}
        </div>

        {error && <div style={styles.error}>{error}</div>}
      </section>
      <section style={styles.panel}>
        <h2 style={styles.heading}>Move your library</h2>
        <p style={styles.intro}>
          Export your shelves, reading dates and progress, shelf history, ratings,
          reviews, and private notes as a JSON file. In the other Quiver, open
          Bookie Settings and import that file. Your existing books and writing
          there will not be overwritten. Keep the file private.
        </p>
        <button type="button" style={styles.button} disabled={!context || exportRequested || importing}
          onClick={() => { setMessage(""); setError(""); setExportRequested(true); }}>
          {exportRequested ? "Preparing export…" : "Download my library"}
        </button>
        <label style={styles.optionTitle} htmlFor="library-file">Import a Bookie JSON export</label>
        <input id="library-file" type="file" accept=".json,application/json"
          disabled={!context || importing} onChange={(event) => {
            void selectFile(event.target.files?.[0]);
            event.target.value = "";
          }} />
        {file && <p style={styles.intro}>{fileName}: {file.books.length} books ready to merge.</p>}
        <button type="button" style={styles.button} disabled={!file || importing || !context}
          onClick={() => void importFile()}>
          {importing ? "Importing…" : "Import into my library"}
        </button>
        {message && <p role="status" style={styles.intro}>{message}</p>}
        {error && <div role="alert" style={styles.error}>{error}</div>}
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: "100%",
    background: "var(--app-bg)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-sans)",
  },
  panel: {
    maxWidth: 640,
    padding: "var(--space-lg)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-md)",
  },
  heading: {
    margin: 0,
    fontSize: "var(--font-size-xl)",
  },
  intro: {
    margin: "var(--space-xs) 0 0",
    color: "var(--text-secondary)",
    fontSize: "var(--font-size-sm)",
    lineHeight: 1.5,
  },
  options: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-sm)",
  },
  option: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "20px 1fr",
    gap: "var(--space-sm)",
    padding: "var(--space-md)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--topbar-border)",
    background: "var(--app-bg)",
    color: "inherit",
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
  },
  optionActive: {
    borderColor: "var(--accent)",
    background: "color-mix(in srgb, var(--accent) 8%, var(--app-bg))",
  },
  optionDisabled: {
    cursor: "default",
    opacity: 0.7,
  },
  radio: {
    width: 16,
    height: 16,
    marginTop: 2,
    borderRadius: "50%",
    border: "2px solid var(--text-muted)",
    boxShadow: "inset 0 0 0 3px var(--app-bg)",
  },
  radioActive: {
    borderColor: "var(--accent)",
    background: "var(--accent)",
  },
  optionTitle: {
    display: "block",
    color: "var(--text-primary)",
    fontSize: "var(--font-size-base)",
    fontWeight: 600,
  },
  optionDescription: {
    display: "block",
    marginTop: 4,
    color: "var(--text-muted)",
    fontSize: "var(--font-size-sm)",
    lineHeight: 1.4,
  },
  error: {
    padding: "var(--space-sm)",
    borderRadius: "var(--radius-sm)",
    background: "color-mix(in srgb, var(--accent-red) 15%, transparent)",
    color: "var(--accent-red)",
    fontSize: "var(--font-size-sm)",
  },
  button: {
    alignSelf: "flex-start",
    padding: "var(--space-sm) var(--space-md)",
    border: "1px solid var(--topbar-border)",
    borderRadius: "var(--radius-sm)",
    background: "var(--app-bg)",
    color: "var(--text-primary)",
    font: "inherit",
    cursor: "pointer",
  },
};
