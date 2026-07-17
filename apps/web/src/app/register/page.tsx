"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  browserSupportsWebAuthn,
  startRegistration,
} from "@simplewebauthn/browser";
import { UserPlus } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/components/auth/auth-provider";

/**
 * Phase 2 registration: email is an account identifier only.
 * Passkey ceremony proves authenticator possession — not email ownership.
 */
export default function RegisterPage() {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
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

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!browserSupportsWebAuthn()) {
      setError("Passkeys are not supported in this browser or environment.");
      return;
    }

    setBusy(true);
    try {
      const options = await apiFetch<PublicKeyCredentialCreationOptionsJSON>(
        "/api/v1/auth/register/options",
        {
          method: "POST",
          body: { email, displayName, organizationName },
        },
      );

      const attestation = await startRegistration({ optionsJSON: options });

      await apiFetch("/api/v1/auth/register/verify", {
        method: "POST",
        body: attestation,
      });

      const authenticated = await refresh();
      if (!authenticated) {
        setError("We couldn't establish your secure session. Please try again.");
        return;
      }
      router.replace("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        // 404 usually means an old API process is on :3001 without Phase 2 auth routes.
        setError(
          err.statusCode === 404
            ? "Auth API route not found. Restart the Fastify API (pnpm dev) so Phase 2 routes are loaded on port 3001."
            : err.message,
        );
      } else if (err instanceof Error && err.name === "NotAllowedError") {
        setError("Passkey creation was cancelled or timed out.");
      } else {
        setError("Could not create your account. Please try again.");
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
            <UserPlus className="h-5 w-5" aria-hidden />
          </div>
          <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight">
            Create your account
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            Register with a passkey. No passwords. Email identifies your account
            but is not verified in this phase.
          </p>

          {!supported ? (
            <p className="mt-6 rounded-md border border-[var(--border)] bg-ink-50 px-3 py-2 text-sm text-[var(--muted)] dark:bg-ink-900">
              Passkeys are not supported in this browser or environment.
            </p>
          ) : (
            <form className="mt-8 space-y-4" onSubmit={(e) => void handleRegister(e)}>
              <Field
                label="Email"
                type="email"
                autoComplete="username webauthn"
                value={email}
                onChange={setEmail}
                required
              />
              <Field
                label="Display name"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={setDisplayName}
                required
              />
              <Field
                label="Organization name"
                type="text"
                value={organizationName}
                onChange={setOrganizationName}
                required
              />

              {error ? (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {error}
                </p>
              ) : null}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Waiting for passkey…" : "Create account with passkey"}
              </Button>
            </form>
          )}

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

function Field({
  label,
  type,
  value,
  onChange,
  required,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  autoComplete?: string;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <label className="block text-sm" htmlFor={id}>
      <span className="mb-1.5 block font-medium">{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoComplete={autoComplete}
        className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      />
    </label>
  );
}

type PublicKeyCredentialCreationOptionsJSON = Parameters<
  typeof startRegistration
>[0]["optionsJSON"];
