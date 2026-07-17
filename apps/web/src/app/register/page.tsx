import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Register",
};

/**
 * Phase 1: UI shell only.
 * Phase 2 will replace this placeholder with Passkey registration (WebAuthn).
 * No passwords or fake auth state are created here.
 */
export default function RegisterPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8 shadow-soft">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] text-[var(--accent)]">
            <UserPlus className="h-5 w-5" aria-hidden />
          </div>
          <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight">
            Create your account
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            Account creation will use Passkey registration — no passwords. This
            shell reserves the flow layout for Phase 2 WebAuthn integration.
          </p>

          <div className="mt-8 space-y-3">
            <Button className="w-full" disabled>
              Register with Passkey
            </Button>
            <p className="text-center font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
              Credential creation — coming in Phase 2
            </p>
          </div>

          <p className="mt-8 text-sm text-[var(--muted)]">
            Already registered?{" "}
            <Link
              href="/login"
              className="font-medium text-[var(--foreground)] underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
