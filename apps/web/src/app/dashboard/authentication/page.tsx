"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api";

type RiskSignal = {
  id?: string;
  type: string;
  triggered: boolean;
  contribution: number;
  severity: string;
  reason: string;
};

type RiskAssessment = {
  id: string;
  score: number;
  level: string;
  recommendedDecision: string;
  enforcedDecision: string;
  mode: string;
  ipAddressMasked: string | null;
  userAgent: string | null;
  createdAt: string;
  signals?: RiskSignal[];
  user?: { displayName: string; email: string };
};

type AuthEventRow = {
  id: string;
  type: string;
  success: boolean;
  createdAt: string;
  ipAddressMasked: string | null;
  userAgent: string | null;
  user: { displayName: string; email: string } | null;
  risk: RiskAssessment | null;
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
      return "bg-ink-100 text-ink-800 dark:bg-ink-900";
  }
}

function signalLabel(type: string): string {
  switch (type) {
    case "UNKNOWN_USER_AGENT":
      return "New browser/device profile";
    case "UNKNOWN_IP":
      return "New IP address";
    case "RECENT_FAILURES":
      return "Repeated failed attempts";
    case "RAPID_ATTEMPTS":
      return "Rapid authentication activity";
    case "NEW_CREDENTIAL":
      return "New or first-use credential";
    case "NEW_ACCOUNT":
      return "Recently created account";
    case "HIGH_SESSION_COUNT":
      return "Elevated active sessions";
    case "LONG_DORMANCY":
      return "Long account dormancy";
    case "COMPOUND_NEW_CONTEXT":
      return "Compound: new network + browser context";
    case "COMPOUND_NEW_CONTEXT_WITH_FAILURES":
      return "Compound: new context after failures";
    default:
      return type;
  }
}

export default function AuthenticationPage() {
  const router = useRouter();
  const [events, setEvents] = useState<AuthEventRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [simResult, setSimResult] = useState<{
    score: number;
    level: string;
    recommendedDecision: string;
    mode: string;
    reasons: string[];
    signals: RiskSignal[];
  } | null>(null);
  const [simBusy, setSimBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ events: AuthEventRow[] }>(
        "/api/v1/risk/events?limit=50",
      );
      setEvents(res.events);
      if (!selectedId && res.events[0]?.risk) {
        setSelectedId(res.events[0].risk.id);
      }
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) {
        router.replace("/login");
        return;
      }
      setError("Could not load authentication events.");
    } finally {
      setLoading(false);
    }
  }, [router, selectedId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const selected = useMemo(() => {
    for (const event of events) {
      if (event.risk && event.risk.id === selectedId) {
        return { event, risk: event.risk };
      }
    }
    return null;
  }, [events, selectedId]);

  async function runSimulation() {
    setSimBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{
        simulation: boolean;
        result: {
          score: number;
          level: string;
          recommendedDecision: string;
          mode: string;
          reasons: string[];
          signals: RiskSignal[];
        };
      }>("/api/v1/risk/simulate", {
        method: "POST",
        body: {
          isKnownCredential: true,
          isKnownUserAgent: false,
          isKnownIpAddress: false,
          recentFailedAttemptsShort: 4,
          recentFailedAttemptsLong: 4,
          rapidAttemptCount: 2,
          activeSessionCount: 2,
          accountAgeHours: 720,
          credentialAgeHours: 720,
          hoursSinceLastLogin: 48,
        },
      });
      setSimResult(res.result);
    } catch {
      setError("Simulation failed.");
    } finally {
      setSimBusy(false);
    }
  }

  return (
    <DashboardShell
      title="Authentication"
      description="Passkey events and explainable risk assessments."
    >
      <div className="mx-auto max-w-5xl space-y-8">
        {error ? (
          <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
        ) : null}

        {loading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : events.length === 0 ? (
          <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
            <h2 className="font-display text-xl font-semibold">
              No authentication events yet
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Successful passkey logins create authentication events and risk
              assessments in Observe Mode.
            </p>
          </section>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Authentication events
              </h2>
              <ul className="mt-4 divide-y divide-[var(--border)]">
                {events.map((event) => {
                  const risk = event.risk;
                  const active = risk && risk.id === selectedId;
                  return (
                    <li key={event.id}>
                      <button
                        type="button"
                        className={`flex w-full flex-col gap-1 px-2 py-3 text-left transition ${
                          active
                            ? "bg-ink-50 dark:bg-ink-900/60"
                            : "hover:bg-ink-50/70 dark:hover:bg-ink-900/40"
                        }`}
                        onClick={() => {
                          if (risk) setSelectedId(risk.id);
                        }}
                        disabled={!risk}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium">
                            {event.success ? "Success" : "Failure"} ·{" "}
                            {event.type.replaceAll("_", " ").toLowerCase()}
                          </span>
                          {risk ? (
                            <span
                              className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${levelClass(risk.level)}`}
                            >
                              {risk.level} · {risk.score}
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--muted)]">
                              No risk record
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--muted)]">
                          {new Date(event.createdAt).toLocaleString()}
                          {event.user ? ` · ${event.user.displayName}` : ""}
                          {risk
                            ? ` · recommended ${risk.recommendedDecision}`
                            : ""}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Assessment detail
              </h2>
              {!selected ? (
                <p className="mt-4 text-sm text-[var(--muted)]">
                  Select an event with a risk assessment to inspect signals and
                  reasons.
                </p>
              ) : (
                <div className="mt-4 space-y-5 text-sm">
                  <div>
                    <p className="font-display text-3xl font-semibold tabular-nums">
                      {selected.risk.score}
                      <span className="text-base font-normal text-[var(--muted)]">
                        /100
                      </span>
                    </p>
                    <p className="mt-1">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${levelClass(selected.risk.level)}`}
                      >
                        {selected.risk.level}
                      </span>
                    </p>
                  </div>

                  <dl className="space-y-2">
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--muted)]">Recommended</dt>
                      <dd className="font-mono text-xs uppercase">
                        {selected.risk.recommendedDecision}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--muted)]">Enforced</dt>
                      <dd className="font-mono text-xs uppercase">
                        {selected.risk.enforcedDecision}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--muted)]">Mode</dt>
                      <dd className="font-mono text-xs uppercase">
                        {selected.risk.mode}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--muted)]">IP (masked)</dt>
                      <dd className="font-mono text-xs">
                        {selected.risk.ipAddressMasked ?? "—"}
                      </dd>
                    </div>
                  </dl>

                  <div>
                    <h3 className="font-medium">Why this decision?</h3>
                    <ul className="mt-3 space-y-3">
                      {(selected.risk.signals ?? [])
                        .filter((s) => s.triggered && s.contribution > 0)
                        .map((signal) => (
                          <li
                            key={signal.id ?? signal.type}
                            className="border-l-2 border-[var(--border)] pl-3"
                          >
                            <p className="font-medium">
                              +{signal.contribution} {signalLabel(signal.type)}
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                              {signal.reason}
                            </p>
                          </li>
                        ))}
                      {(selected.risk.signals ?? []).filter(
                        (s) => s.triggered && s.contribution > 0,
                      ).length === 0 ? (
                        <li className="text-xs text-[var(--muted)]">
                          No risk-increasing signals. Returning context matched
                          prior successful authentications.
                        </li>
                      ) : null}
                    </ul>
                  </div>

                  <p className="text-xs leading-relaxed text-[var(--muted)]">
                    Recommended:{" "}
                    <span className="font-mono uppercase">
                      {selected.risk.recommendedDecision}
                    </span>
                    . Enforcement:{" "}
                    {selected.risk.mode === "OBSERVE"
                      ? "Not applied because the risk engine is currently in Observe Mode."
                      : `Applied as ${selected.risk.enforcedDecision}.`}
                  </p>
                </div>
              )}
            </section>
          </div>
        )}

        <section className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Risk simulator
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Runs the same deterministic engine package used at login. Results are
            labeled SIMULATION and are not stored as real assessments.
          </p>
          <div className="mt-4">
            <Button
              type="button"
              variant="secondary"
              disabled={simBusy}
              onClick={() => void runSimulation()}
            >
              {simBusy ? "Running…" : "Simulate new IP + UA + failures"}
            </Button>
          </div>
          {simResult ? (
            <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4 text-sm">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                Simulation
              </p>
              <p>
                Score {simResult.score}/100 · {simResult.level} · recommended{" "}
                {simResult.recommendedDecision} · mode {simResult.mode}
              </p>
              <ul className="space-y-1 text-xs text-[var(--muted)]">
                {simResult.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>
    </DashboardShell>
  );
}
