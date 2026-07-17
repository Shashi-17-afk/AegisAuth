import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = {
  title: "Audit Logs",
};

export default function AuditPage() {
  return (
    <DashboardShell
      title="Audit Logs"
      description="Tamper-evident security event history."
    >
      <EmptyState
        title="No security events recorded."
        description="Audit integrity chains will be introduced when the audit subsystem is built."
      />
    </DashboardShell>
  );
}
