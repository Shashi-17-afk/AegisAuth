"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  browserSupportsWebAuthn,
  startAuthentication,
} from "@simplewebauthn/browser";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api";

type ApplicationRow = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  organization: { id: string; name: string; slug: string };
  viewerRole: string;
  canRequestDelete: boolean;
};

type Authorization = {
  id: string;
  status: string;
  intentHash: string;
  displaySummary: {
    actionLabel?: string;
    applicationName?: string;
    organizationName?: string;
    applicationId?: string;
  };
  pendingExpiresAt: string;
  executionExpiresAt: string | null;
  authorizedAt: string | null;
  executedAt: string | null;
};

type DeleteFlow = {
  application: ApplicationRow;
  authorization: Authorization | null;
  step: "review" | "authorized" | "done";
};

export default function ApplicationsPage() {
  const router = useRouter();
  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flow, setFlow] = useState<DeleteFlow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ applications: ApplicationRow[] }>(
        "/api/v1/applications",
      );
      setApps(res.applications);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) {
        router.replace("/login");
        return;
      }
      setError("Could not load applications.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/v1/applications", {
        method: "POST",
        body: { name: name.trim() },
      });
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed.");
    } finally {
      setBusy(false);
    }
  }

  async function startDelete(application: ApplicationRow) {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ authorization: Authorization }>(
        "/api/v1/actions/authorizations",
        {
          method: "POST",
          body: {
            actionType: "DELETE_APPLICATION",
            targetId: application.id,
          },
        },
      );
      setFlow({
        application,
        authorization: res.authorization,
        step: "review",
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start deletion.");
    } finally {
      setBusy(false);
    }
  }

  async function authorizeWithPasskey() {
    if (!flow?.authorization) return;
    if (!browserSupportsWebAuthn()) {
      setError("Passkeys are not supported in this browser.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { options } = await apiFetch<{
        options: PublicKeyCredentialRequestOptionsJSON;
      }>(`/api/v1/actions/authorizations/${flow.authorization.id}/options`, {
        method: "POST",
        body: {},
      });

      const assertion = await startAuthentication({ optionsJSON: options });

      const verified = await apiFetch<{ authorization: Authorization }>(
        `/api/v1/actions/authorizations/${flow.authorization.id}/verify`,
        { method: "POST", body: assertion },
      );

      setFlow({
        ...flow,
        authorization: verified.authorization,
        step: "authorized",
      });
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError("Passkey authorization was cancelled or timed out.");
      } else {
        setError(err instanceof ApiError ? err.message : "Authorization failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function executeAuthorized() {
    if (!flow?.authorization) return;
    setBusy(true);
    setError(null);
    try {
      const executed = await apiFetch<{ authorization: Authorization }>(
        `/api/v1/actions/authorizations/${flow.authorization.id}/execute`,
        { method: "POST", body: {} },
      );
      setFlow({
        ...flow,
        authorization: executed.authorization,
        step: "done",
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Execution failed.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelFlow() {
    if (!flow?.authorization) {
      setFlow(null);
      return;
    }
    setBusy(true);
    try {
      if (
        flow.authorization.status === "PENDING" ||
        flow.authorization.status === "AUTHORIZED"
      ) {
        await apiFetch(
          `/api/v1/actions/authorizations/${flow.authorization.id}/cancel`,
          { method: "POST", body: {} },
        );
      }
    } catch {
      // ignore cancel errors when closing UI
    } finally {
      setBusy(false);
      setFlow(null);
    }
  }

  const summary = flow?.authorization?.displaySummary;

  return (
    <DashboardShell
      title="Applications"
      description="Create disposable apps and delete them with intent-bound passkey authorization."
    >
      <div className="mx-auto max-w-3xl space-y-8">
        {error ? (
          <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
        ) : null}

        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Create application
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Use a disposable name for Phase 4 delete demonstrations.
          </p>
          <form onSubmit={(e) => void handleCreate(e)} className="mt-4 flex gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Demo app name"
              className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              required
              maxLength={120}
            />
            <Button type="submit" disabled={busy || !name.trim()}>
              Create
            </Button>
          </form>
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Your applications
          </h2>
          {loading ? (
            <p className="mt-4 text-sm text-[var(--muted)]">Loading…</p>
          ) : apps.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--muted)]">
              No applications yet. Create one above to try protected deletion.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--border)]">
              {apps.map((app) => (
                <li
                  key={app.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="font-medium">{app.name}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {app.organization.name} · {app.slug}
                    </p>
                  </div>
                  {app.canRequestDelete ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void startDelete(app)}
                    >
                      Delete
                    </Button>
                  ) : (
                    <span className="text-xs text-[var(--muted)]">View only</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {flow ? (
          <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
              Sensitive action
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
              {summary?.actionLabel ?? "Delete application"}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              This authorization applies only to this exact action. A valid
              session alone is not enough — passkey confirmation is required.
            </p>

            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)]">Application</dt>
                <dd className="font-medium">{summary?.applicationName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)]">Application ID</dt>
                <dd className="font-mono text-xs">
                  {summary?.applicationId?.slice(0, 8)}…
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)]">Organization</dt>
                <dd className="font-medium">{summary?.organizationName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)]">Status</dt>
                <dd className="font-mono text-xs uppercase">
                  {flow.authorization?.status}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)]">Intent hash</dt>
                <dd className="font-mono text-xs">
                  {flow.authorization?.intentHash.slice(0, 12)}…
                </dd>
              </div>
            </dl>

            <div className="mt-6 flex flex-wrap gap-3">
              {flow.step === "review" ? (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void authorizeWithPasskey()}
                >
                  Authorize with passkey
                </Button>
              ) : null}
              {flow.step === "authorized" ? (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void executeAuthorized()}
                >
                  Execute authorized action
                </Button>
              ) : null}
              {flow.step === "done" ? (
                <p className="text-sm text-emerald-800 dark:text-emerald-200">
                  Application deleted. Authorization is EXECUTED (replay will fail).
                </p>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void cancelFlow()}
              >
                {flow.step === "done" ? "Close" : "Cancel"}
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </DashboardShell>
  );
}

type PublicKeyCredentialRequestOptionsJSON = Parameters<
  typeof startAuthentication
>[0]["optionsJSON"];
