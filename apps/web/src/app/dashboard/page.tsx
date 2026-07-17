"use client";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { RiskOverviewPanel } from "@/components/dashboard/risk-overview-panel";
import { useAuth } from "@/components/auth/auth-provider";

export default function DashboardOverviewPage() {
  const { user, organizations } = useAuth();
  const primaryOrg = organizations[0];

  return (
    <DashboardShell
      title="Overview"
      description="Your AegisAuth platform account."
    >
      <div className="mx-auto max-w-4xl space-y-8">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Signed in
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4 border-b border-[var(--border)] pb-3">
              <dt className="text-[var(--muted)]">Display name</dt>
              <dd className="font-medium">{user?.displayName}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-[var(--border)] pb-3">
              <dt className="text-[var(--muted)]">Email</dt>
              <dd className="font-medium">{user?.email}</dd>
            </div>
            {primaryOrg ? (
              <>
                <div className="flex justify-between gap-4 border-b border-[var(--border)] pb-3">
                  <dt className="text-[var(--muted)]">Organization</dt>
                  <dd className="font-medium">{primaryOrg.name}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted)]">Role</dt>
                  <dd className="font-mono text-xs uppercase tracking-wider">
                    {primaryOrg.role}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
          <p className="mt-6 text-xs leading-relaxed text-[var(--muted)]">
            Email identifies your account. Passkeys prove authenticator
            possession. Risk assessments observe login context without blocking
            valid WebAuthn in Phase 3.
          </p>
        </section>

        <RiskOverviewPanel />
      </div>
    </DashboardShell>
  );
}
