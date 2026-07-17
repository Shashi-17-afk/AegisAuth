import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = {
  title: "Policies",
};

export default function PoliciesPage() {
  return (
    <DashboardShell
      title="Policies"
      description="Multi-party approval and authorization policies."
    >
      <EmptyState
        title="No approval policies configured."
        description="Policy configuration arrives with the authorization engine in a future phase."
      />
    </DashboardShell>
  );
}
