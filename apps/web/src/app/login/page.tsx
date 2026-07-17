"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  browserSupportsWebAuthn,
  startAuthentication,
} from "@simplewebauthn/browser";
import { KeyRound } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/components/auth/auth-provider";

/**
 * Prefer discoverable (usernameless) passkey authentication.
 * Email is not required as an authentication factor.
 */
export default function LoginPage() {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
  }, []);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [loading, user, router]);

  async function handleLogin() {
    setError(null);

    if (!browserSupportsWebAuthn()) {
      setError("Passkeys are not supported in this browser or environment.");
      return;
    }

    setBusy(true);
    try {
      const options = await apiFetch<PublicKeyCredentialRequestOptionsJSON>(
        "/api/v1/auth/login/options",
        { method: "POST", body: {} },
      );

      const assertion = await startAuthentication({ optionsJSON: options });

      await apiFetch("/api/v1/auth/login/verify", {
        method: "POST",
        body: assertion,
      });

      const authenticated = await refresh();
      if (!authenticated) {
        setError("We couldn't establish your secure session. Please try again.");
        return;
      }
      router.replace("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error && err.name === "NotAllowedError") {
        setError("Passkey sign-in was cancelled or timed out.");
      } else {
        setError("Could not sign in. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

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
            Sign in with a passkey registered to your AegisAuth platform account.
          </p>

          {!supported ? (
            <p className="mt-6 rounded-md border border-[var(--border)] bg-ink-50 px-3 py-2 text-sm text-[var(--muted)] dark:bg-ink-900">
              Passkeys are not supported in this browser or environment.
            </p>
          ) : (
            <div className="mt-8 space-y-3">
              <Button
                className="w-full"
                disabled={busy}
                onClick={() => void handleLogin()}
              >
                {busy ? "Waiting for passkey…" : "Sign in with a passkey"}
              </Button>
              {error ? (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {error}
                </p>
              ) : null}
              <p className="text-center font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                Discoverable credential · no password
              </p>
            </div>
          )}

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

type PublicKeyCredentialRequestOptionsJSON = Parameters<
  typeof startAuthentication
>[0]["optionsJSON"];
