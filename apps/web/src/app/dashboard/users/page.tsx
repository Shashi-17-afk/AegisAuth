import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = {
  title: "Users",
};

export default function UsersPage() {
  return (
    <DashboardShell title="Users" description="Authenticated end users across applications.">
      <EmptyState
        title="No users have authenticated yet."
        description="User records will appear after authentication is implemented in a later phase."
      />
    </DashboardShell>
  );
}
