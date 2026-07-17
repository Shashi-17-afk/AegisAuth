import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = {
  title: "Authentication",
};

export default function AuthenticationPage() {
  return (
    <DashboardShell
      title="Authentication"
      description="Passkey and WebAuthn authentication events."
    >
      <EmptyState
        title="No authentication events yet."
        description="Authentication telemetry will be recorded once Passkey flows are live."
      />
    </DashboardShell>
  );
}
