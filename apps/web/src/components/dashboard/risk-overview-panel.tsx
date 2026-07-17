"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";

type RiskSummary = {
  mode: string;
  orgWide: boolean;
  totals: {
    total: number;
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  recent: Array<{
    id: string;
    score: number;
    level: string;
    recommendedDecision: string;
    enforcedDecision: string;
    mode: string;
    createdAt: string;
    user?: { displayName: string; email: string };
  }>;
};

function levelClass(level: string): string {
  switch (level) {
    case "LOW":
      return "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200";
    case "MEDIUM":
      return "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
    case "HIGH":
      return "bg-orange-50 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200";
    case "CRITICAL":
      return "bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200";
    default:
      return "bg-ink-100 text-ink-800 dark:bg-ink-900 dark:text-ink-100";
  }
}

export function RiskOverviewPanel() {
  const router = useRouter();
  const [data, setData] = useState<RiskSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const summary = await apiFetch<RiskSummary>("/api/v1/risk/summary");
      setData(summary);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) {
        router.replace("/login");
        return;
      }
      setError("Could not load risk summary.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <p className="text-sm text-[var(--muted)]">Loading risk assessments…</p>
    );
  }

  if (error) {
    return <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>;
  }

  if (!data || data.totals.total === 0) {
    return (
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Risk assessments
        </h2>
        <p className="mt-3 text-sm text-[var(--muted)]">
          No risk assessments yet. Sign out and sign in with a passkey to generate
          the first observation.
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Engine mode: <span className="font-mono uppercase">{data?.mode ?? "OBSERVE"}</span>{" "}
          — recommendations are recorded but do not block login.
        </p>
      </section>
    );
  }

  const stats = [
    { label: "Total", value: data.totals.total },
    { label: "Low", value: data.totals.low },
    { label: "Medium", value: data.totals.medium },
    { label: "High", value: data.totals.high },
    { label: "Critical", value: data.totals.critical },
  ];

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Risk overview
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Deterministic rule-based assessments from passkey logins. Mode:{" "}
              <span className="font-mono uppercase">{data.mode}</span>
              {data.orgWide ? " · organization view" : " · your assessments only"}
            </p>
          </div>
          <Link
            href="/dashboard/authentication"
            className="text-sm font-medium text-[var(--foreground)] underline-offset-4 hover:underline"
          >
            Open authentication security
          </Link>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="border border-[var(--border)] px-3 py-3"
            >
              <dt className="text-xs uppercase tracking-wider text-[var(--muted)]">
                {stat.label}
              </dt>
              <dd className="mt-1 font-display text-2xl font-semibold tabular-nums">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <h3 className="font-display text-lg font-semibold tracking-tight">
          Recent assessments
        </h3>
        <ul className="mt-4 divide-y divide-[var(--border)]">
          {data.recent.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {row.user?.displayName ?? "User"} · {row.score}/100
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {new Date(row.createdAt).toLocaleString()} · recommended{" "}
                  {row.recommendedDecision} · enforced {row.enforcedDecision}
                </p>
              </div>
              <span
                className={`inline-flex rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${levelClass(row.level)}`}
              >
                {row.level}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
