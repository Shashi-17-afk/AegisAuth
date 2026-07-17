import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <DashboardShell
      title="Settings"
      description="Organization and account preferences."
    >
      <EmptyState
        title="Settings coming soon."
        description="Organization settings will be available once account management is implemented."
      />
    </DashboardShell>
  );
}
