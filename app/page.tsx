export default function HomePage() {
  return (
    <main
      style={{
        padding: "2rem",
        maxWidth: 720,
        margin: "0 auto",
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>SmartAI</h1>
      <p style={{ color: "var(--study-muted, #8b9cb3)" }}>
        Press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>X</kbd> for study capture (revision and
        practice only). <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd> retries the last capture.{" "}
        <kbd>Esc</kbd> cancels capture mode while the overlay is open.
      </p>
    </main>
  );
}
