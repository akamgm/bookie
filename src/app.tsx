import { useAppContext } from "@quiver/react";

const appName = "Bookie";

export default function App() {
  const context = useAppContext();
  if (!context) {
    return (
      <main style={styles.shell}>
        <div style={styles.connecting}>Opening the workspace…</div>
      </main>
    );
  }

  return (
    <main style={styles.shell}>
      <section style={styles.card}>
        <div style={styles.glow} />
        <div style={styles.mark}>✦</div>
        <h1 style={styles.title}>{appName}</h1>
        <p style={styles.copy}>
          Fixie is shaping the first version now. This preview will update as
          the idea comes to life.
        </p>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: "100%",
    boxSizing: "border-box",
    display: "grid",
    placeItems: "center",
    padding: 24,
    color: "#20211f",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    background:
      "radial-gradient(circle at 18% 8%, rgba(255,255,255,.94), transparent 35%), linear-gradient(145deg, #f1eee7 0%, #e8ede4 52%, #e1e8e6 100%)",
  },
  connecting: {
    color: "#666b64",
    fontSize: 14,
    letterSpacing: "0.01em",
  },
  card: {
    position: "relative",
    overflow: "hidden",
    width: "min(100%, 520px)",
    boxSizing: "border-box",
    padding: "38px 36px 34px",
    border: "1px solid rgba(34, 42, 34, 0.11)",
    borderRadius: 28,
    background: "rgba(255, 255, 252, 0.82)",
    boxShadow:
      "0 24px 70px rgba(45, 55, 46, 0.12), 0 2px 8px rgba(45, 55, 46, 0.06)",
    backdropFilter: "blur(18px)",
  },
  glow: {
    position: "absolute",
    width: 180,
    height: 180,
    right: -60,
    top: -70,
    borderRadius: "50%",
    background: "rgba(143, 181, 150, 0.2)",
    filter: "blur(4px)",
  },
  mark: {
    position: "relative",
    marginBottom: 18,
    color: "#739178",
    fontSize: 24,
  },
  title: {
    position: "relative",
    margin: 0,
    color: "#20251f",
    fontSize: "clamp(32px, 7vw, 52px)",
    lineHeight: 1.02,
    letterSpacing: "-0.045em",
  },
  copy: {
    position: "relative",
    maxWidth: 410,
    margin: "18px 0 0",
    color: "#666b64",
    fontSize: 16,
    lineHeight: 1.6,
  },
};
