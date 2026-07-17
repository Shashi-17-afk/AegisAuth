import { Fingerprint, ShieldCheck, FileKey2, ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { ConceptCard } from "@/components/ui/empty-state";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main>
        <section className="relative overflow-hidden border-b border-[var(--border)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(13,148,136,0.08),_transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(20,184,166,0.12),_transparent_55%)]"
          />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end lg:py-28">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
                AegisAuth
              </p>
              <h1 className="mt-5 max-w-xl font-display text-4xl font-semibold tracking-tight text-[var(--foreground)] sm:text-5xl lg:text-[3.4rem] lg:leading-[1.1]">
                Authentication that understands risk.
              </h1>
              <p className="mt-6 max-w-lg text-base leading-relaxed text-[var(--muted)] sm:text-lg">
                Passwordless identity, adaptive security, and verifiable
                authorization for applications where trust matters.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button href="/register">
                  Start building
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
                <Button href="/dashboard" variant="secondary">
                  View dashboard shell
                </Button>
              </div>
              <p className="mt-5 max-w-md text-xs leading-relaxed text-[var(--muted)]">
                Phase 1 delivers the product foundation. Passkeys, risk evaluation,
                and authorization APIs arrive in later phases — this page describes
                the vision, not live capabilities.
              </p>
            </div>

            <aside className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-soft">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
                Architecture
              </p>
              <div className="mt-5 space-y-3 font-mono text-sm text-[var(--foreground)]">
                <ArchitectureRow label="Client" value="Next.js" />
                <ArchitectureRow label="API" value="Fastify" />
                <ArchitectureRow label="ORM" value="Prisma" />
                <ArchitectureRow label="Data" value="Supabase PostgreSQL" />
              </div>
              <p className="mt-6 border-t border-[var(--border)] pt-4 text-sm leading-relaxed text-[var(--muted)]">
                Supabase provides managed PostgreSQL only. AegisAuth owns the
                authentication architecture — Supabase Auth is not used.
              </p>
            </aside>
          </div>
        </section>

        <section id="platform" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-semibold tracking-tight">
              Built for developers who ship trust-critical software.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[var(--muted)]">
              AegisAuth is a developer-first platform for passwordless
              authentication and verifiable authorization. The foundation is a
              typed monorepo, a versioned API, and a clean data layer ready for
              WebAuthn, adaptive risk, and intent-bound approvals.
            </p>
          </div>
        </section>

        <section
          id="concepts"
          className="border-y border-[var(--border)] bg-[var(--surface)]/50"
        >
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="font-display text-3xl font-semibold tracking-tight">
              Three platform concepts
            </h2>
            <p className="mt-3 max-w-2xl text-base text-[var(--muted)]">
              These capabilities define the product roadmap. They are not
              implemented in Phase 1.
            </p>
            <div className="mt-12 grid gap-10 md:grid-cols-3">
              <ConceptCard
                icon={Fingerprint}
                title="Passwordless Identity"
                description="Future authentication based on Passkeys and WebAuthn instead of passwords — reducing phishing surface and shared-secret risk."
              />
              <ConceptCard
                icon={ShieldCheck}
                title="Adaptive Security"
                description="Future risk-aware authentication that can respond differently depending on context, device posture, and behavioral signals."
              />
              <ConceptCard
                icon={FileKey2}
                title="Verifiable Authorization"
                description="Future ability to securely authorize sensitive actions and prove approval with intent-bound cryptographic evidence."
              />
            </div>
          </div>
        </section>

        <section id="developers" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-semibold tracking-tight">
              Integrate when the auth layer is ready.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[var(--muted)]">
              Explore the dashboard shell and API foundation today. Authentication
              endpoints, SDKs, and passkey flows will land in Phase 2 and beyond —
              designed against this architecture, not bolted on later.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="/register">Create developer account</Button>
              <Button href="/login" variant="secondary">
                Sign in
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function ArchitectureRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-3 last:border-0 last:pb-0">
      <span className="text-[var(--muted)]">{label}</span>
      <span>{value}</span>
    </div>
  );
}
