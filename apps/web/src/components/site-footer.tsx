export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="font-display text-lg font-semibold">AegisAuth</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Adaptive passwordless authentication &amp; verifiable authorization.
          </p>
        </div>
        <p className="font-mono text-xs text-[var(--muted)]">
          Phase 1 — Foundation
        </p>
      </div>
    </footer>
  );
}
