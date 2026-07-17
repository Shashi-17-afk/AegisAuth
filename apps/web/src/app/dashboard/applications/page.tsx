import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = {
  title: "Applications",
};

export default function ApplicationsPage() {
  return (
    <DashboardShell
      title="Applications"
      description="Applications registered under your organization."
    >
      <EmptyState
        title="No applications yet."
        description="When application management is available, registered apps will appear here."
      />
    </DashboardShell>
  );
}
