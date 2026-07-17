import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Sign in",
};

/**
 * Phase 1: UI shell only.
 * Phase 2 will replace this placeholder with a real WebAuthn/Passkey ceremony.
 * No credentials are accepted or stored here.
 */
export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8 shadow-soft">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] text-[var(--accent)]">
            <KeyRound className="h-5 w-5" aria-hidden />
          </div>
          <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight">
            Sign in
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            Passwordless sign-in with Passkeys will be available in a future
            phase. This page is a structured shell — not a working login.
          </p>

          <div className="mt-8 space-y-3">
            <Button className="w-full" disabled>
              Continue with Passkey
            </Button>
            <p className="text-center font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
              WebAuthn ceremony — coming in Phase 2
            </p>
          </div>

          <p className="mt-8 text-sm text-[var(--muted)]">
            New here?{" "}
            <Link
              href="/register"
              className="font-medium text-[var(--foreground)] underline-offset-4 hover:underline"
            >
              Create an account
            </Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
