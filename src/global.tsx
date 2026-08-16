import { useState } from "react";
import { useAppContext, useMutation, useQuery } from "@quiver/react";

type ShelfDisplay = "details" | "covers";

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
  const [saving, setSaving] = useState<ShelfDisplay | null>(null);
  const [error, setError] = useState("");
  const selected = preferences?.shelfDisplay ?? "details";

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
};
