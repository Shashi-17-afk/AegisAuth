"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { apiFetch, ApiError } from "@/lib/api";

type AuthorizationRow = {
  id: string;
  actionType: string;
  targetType: string;
  targetId: string;
  intentHash: string;
  status: string;
  createdAt: string;
  authorizedAt: string | null;
  executedAt: string | null;
  displaySummary: {
    actionLabel?: string;
    applicationName?: string;
    organizationName?: string;
  };
  organization?: { id: string; name: string };
  actor?: { id: string; displayName: string; email: string };
  riskAssessment?: {
    score: number;
    level: string;
    recommendedDecision: string;
    mode: string;
  } | null;
  intentPayload?: unknown;
  events?: Array<{
    id: string;
    type: string;
    success: boolean;
    createdAt: string;
  }>;
};

function statusClass(status: string): string {
  switch (status) {
    case "PENDING":
      return "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
    case "AUTHORIZED":
      return "bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200";
    case "EXECUTED":
      return "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
    case "FAILED":
    case "EXPIRED":
    case "CANCELLED":
      return "bg-ink-100 text-ink-800 dark:bg-ink-900 dark:text-ink-100";
    default:
      return "bg-ink-100 text-ink-800";
  }
}

export default function ActionsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<AuthorizationRow[]>([]);
  const [selected, setSelected] = useState<AuthorizationRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ authorizations: AuthorizationRow[] }>(
        "/api/v1/actions/authorizations?limit=50",
      );
      setRows(res.authorizations);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) {
        router.replace("/login");
        return;
      }
      setError("Could not load action authorizations.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(id: string) {
    setError(null);
    try {
      const res = await apiFetch<{ authorization: AuthorizationRow }>(
        `/api/v1/actions/authorizations/${id}`,
      );
      setSelected(res.authorization);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load detail.");
    }
  }

  return (
    <DashboardShell
      title="Actions"
      description="Intent-bound action authorizations — exact approved actions only."
    >
      <div className="mx-auto max-w-5xl space-y-8">
        {error ? (
          <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
        ) : null}

        {loading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : rows.length === 0 ? (
          <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
            <h2 className="font-display text-xl font-semibold">
              No authorization requests yet
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Delete an application from the Applications page to create a
              PENDING → AUTHORIZED → EXECUTED lifecycle.
            </p>
          </section>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
              <h2 className="font-display text-lg font-semibold">
                Authorizations
              </h2>
              <ul className="mt-4 divide-y divide-[var(--border)]">
                {rows.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col gap-1 px-2 py-3 text-left hover:bg-ink-50/70 dark:hover:bg-ink-900/40"
                      onClick={() => void openDetail(row.id)}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {row.displaySummary.actionLabel ?? row.actionType}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${statusClass(row.status)}`}
                        >
                          {row.status}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--muted)]">
                        {row.displaySummary.applicationName ?? row.targetId.slice(0, 8)}
                        {row.organization
                          ? ` · ${row.organization.name}`
                          : ""}{" "}
                        · {new Date(row.createdAt).toLocaleString()}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
              <h2 className="font-display text-lg font-semibold">
                Authorization detail
              </h2>
              {!selected ? (
                <p className="mt-4 text-sm text-[var(--muted)]">
                  Select an authorization to inspect the exact stored intent.
                </p>
              ) : (
                <div className="mt-4 space-y-4 text-sm">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${statusClass(selected.status)}`}
                  >
                    {selected.status}
                  </span>

                  <dl className="space-y-2">
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--muted)]">Actor</dt>
                      <dd>{selected.actor?.displayName}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--muted)]">Organization</dt>
                      <dd>{selected.organization?.name}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--muted)]">Action</dt>
                      <dd>
                        {selected.displaySummary.actionLabel ??
                          selected.actionType}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--muted)]">Target</dt>
                      <dd>{selected.displaySummary.applicationName}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--muted)]">Intent hash</dt>
                      <dd className="font-mono text-xs">
                        {selected.intentHash.slice(0, 16)}…
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--muted)]">Created</dt>
                      <dd className="text-xs">
                        {new Date(selected.createdAt).toLocaleString()}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--muted)]">Authorized</dt>
                      <dd className="text-xs">
                        {selected.authorizedAt
                          ? new Date(selected.authorizedAt).toLocaleString()
                          : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--muted)]">Executed</dt>
                      <dd className="text-xs">
                        {selected.executedAt
                          ? new Date(selected.executedAt).toLocaleString()
                          : "—"}
                      </dd>
                    </div>
                  </dl>

                  <div>
                    <h3 className="font-medium">Authorized intent</h3>
                    <pre className="mt-2 overflow-x-auto rounded border border-[var(--border)] bg-[var(--background)] p-3 text-xs">
                      {JSON.stringify(selected.intentPayload, null, 2)}
                    </pre>
                  </div>

                  <div>
                    <h3 className="font-medium">Security properties</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--muted)]">
                      <li>Bound to this user (actor)</li>
                      <li>Bound to this organization</li>
                      <li>Bound to this exact target</li>
                      <li>Single-use authorization</li>
                      <li>Short-lived pending and execution windows</li>
                      <li>
                        Passkey verification authorizes a server-stored canonical
                        intent (not arbitrary client JSON)
                      </li>
                    </ul>
                  </div>

                  {selected.riskAssessment ? (
                    <div>
                      <h3 className="font-medium">Risk at authorization</h3>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Linked login/context assessment (Observe Mode) — score{" "}
                        {selected.riskAssessment.score}/100 ·{" "}
                        {selected.riskAssessment.level} · recommended{" "}
                        {selected.riskAssessment.recommendedDecision} · mode{" "}
                        {selected.riskAssessment.mode}
                      </p>
                    </div>
                  ) : null}

                  {selected.events && selected.events.length > 0 ? (
                    <div>
                      <h3 className="font-medium">Lifecycle events</h3>
                      <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
                        {selected.events.map((event) => (
                          <li key={event.id}>
                            {event.type} ·{" "}
                            {new Date(event.createdAt).toLocaleString()}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
