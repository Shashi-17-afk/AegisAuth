import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type ConceptCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  status?: string;
};

export function ConceptCard({
  icon: Icon,
  title,
  description,
  status = "Planned",
}: ConceptCardProps) {
  return (
    <article className="border-t border-[var(--border)] pt-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--accent)]">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
          {status}
        </span>
      </div>
      <h3 className="font-display text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{description}</p>
    </article>
  );
}

type EmptyStateProps = {
  title: string;
  description?: string;
  children?: ReactNode;
};

export function EmptyState({ title, description, children }: EmptyStateProps) {
  return (
    <div className="flex min-h-[320px] flex-col items-start justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-10">
      <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--muted)]">
          {description}
        </p>
      ) : null}
      {children}
    </div>
  );
}
