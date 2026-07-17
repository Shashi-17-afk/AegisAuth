import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardOverviewPage() {
  return (
    <DashboardShell
      title="Overview"
      description="Foundation shell for organization and application management."
    >
      <EmptyState
        title="Welcome to AegisAuth"
        description="This dashboard is a Phase 1 shell. Applications, authentication events, policies, and audit data will appear here once those capabilities are implemented."
      />
    </DashboardShell>
  );
}
