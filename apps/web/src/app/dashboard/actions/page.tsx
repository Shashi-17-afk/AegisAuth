import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = {
  title: "Actions",
};

export default function ActionsPage() {
  return (
    <DashboardShell
      title="Actions"
      description="Sensitive action authorization requests."
    >
      <EmptyState
        title="No authorization requests yet."
        description="Intent-bound action approvals will show here in a later phase."
      />
    </DashboardShell>
  );
}
