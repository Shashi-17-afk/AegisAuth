"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/components/auth/auth-provider";

type SessionRow = {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  userAgent: string | null;
  ipAddress: string | null;
  current: boolean;
};

type PasskeyRow = {
  id: string;
  deviceType: string;
  backedUp: boolean;
  friendlyName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  transports: string[];
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function summarizeUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  if (ua.includes("Edg/")) return "Microsoft Edge";
  if (ua.includes("Chrome/")) return "Chrome";
  if (ua.includes("Firefox/")) return "Firefox";
  if (ua.includes("Safari/") && !ua.includes("Chrome")) return "Safari";
  return ua.slice(0, 64);
}

export default function SettingsPage() {
  const router = useRouter();
  const { refresh, logout } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessionsRes, passkeysRes] = await Promise.all([
        apiFetch<{ sessions: SessionRow[] }>("/api/v1/auth/sessions"),
        apiFetch<{ passkeys: PasskeyRow[] }>("/api/v1/auth/passkeys"),
      ]);
      setSessions(sessionsRes.sessions);
      setPasskeys(passkeysRes.passkeys);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) {
        router.replace("/login");
        return;
      }
      setError("Could not load settings.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRevoke(sessionId: string, isCurrent: boolean) {
    setError(null);
    try {
      const result = await apiFetch<{ ok: boolean; revokedCurrent: boolean }>(
        `/api/v1/auth/sessions/${sessionId}`,
        { method: "DELETE" },
      );
      if (result.revokedCurrent || isCurrent) {
        await logout();
        router.replace("/login");
        return;
      }
      await refresh();
      await load();
    } catch {
      setError("Could not revoke session.");
    }
  }

  return (
    <DashboardShell
      title="Settings"
      description="Sessions and passkeys for your platform account."
    >
      <div className="mx-auto max-w-3xl space-y-10">
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <section>
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Active Sessions
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Revoking a session immediately invalidates that cookie server-side.
          </p>
          <div className="mt-4 space-y-3">
            {loading ? (
              <p className="text-sm text-[var(--muted)]">Loading…</p>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No active sessions.</p>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">
                      {summarizeUserAgent(session.userAgent)}
                      {session.current ? (
                        <span className="ml-2 font-mono text-[11px] uppercase tracking-wider text-[var(--accent)]">
                          Current
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[var(--muted)]">
                      IP: {session.ipAddress ?? "—"} · Last used{" "}
                      {formatDate(session.lastUsedAt)}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      Created {formatDate(session.createdAt)}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => void handleRevoke(session.id, session.current)}
                  >
                    {session.current ? "Sign out" : "Revoke"}
                  </Button>
                </div>
              ))
            )}
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Passkeys
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Public credential metadata only. Private keys never leave your
            authenticator. Deletion is disabled until secure recovery exists —
            removing your only passkey would lock the account.
          </p>
          <div className="mt-4 space-y-3">
            {loading ? (
              <p className="text-sm text-[var(--muted)]">Loading…</p>
            ) : passkeys.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No passkeys registered.</p>
            ) : (
              passkeys.map((passkey) => (
                <div
                  key={passkey.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm"
                >
                  <p className="font-medium">
                    {passkey.friendlyName ?? "Passkey"}{" "}
                    <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--muted)]">
                      {passkey.deviceType}
                    </span>
                  </p>
                  <p className="mt-1 text-[var(--muted)]">
                    Backed up: {passkey.backedUp ? "yes" : "no"} · Created{" "}
                    {formatDate(passkey.createdAt)}
                    {passkey.lastUsedAt
                      ? ` · Last used ${formatDate(passkey.lastUsedAt)}`
                      : ""}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
