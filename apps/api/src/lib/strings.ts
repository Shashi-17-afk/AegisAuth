export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function slugify(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return base.length > 0 ? base : "organization";
}

export function uniqueSlug(base: string, suffix: string): string {
  const cleaned = slugify(base);
  const short = suffix.replace(/-/g, "").slice(0, 8);
  return `${cleaned}-${short}`.slice(0, 64);
}
