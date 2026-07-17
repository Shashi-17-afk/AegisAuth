import { z } from "zod";

/**
 * Shared organization / application contracts.
 * Keep these aligned with Prisma models; do not duplicate Prisma client types wholesale.
 */

export const organizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase kebab-case"),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Organization = z.infer<typeof organizationSchema>;

export const applicationSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase kebab-case"),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Application = z.infer<typeof applicationSchema>;
