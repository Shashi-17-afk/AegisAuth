import { z } from "zod";

export const platformUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1).max(120),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type PlatformUser = z.infer<typeof platformUserSchema>;

export const meResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string(),
  }),
  organizations: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      slug: z.string(),
      role: z.enum(["OWNER", "ADMIN", "MEMBER"]),
    }),
  ),
  sessionId: z.string().uuid(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;
