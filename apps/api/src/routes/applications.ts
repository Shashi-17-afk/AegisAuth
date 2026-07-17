import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@aegisauth/database";
import type { Env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { assertTrustedOrigin } from "../lib/request.js";
import { slugify } from "../lib/strings.js";
import { ensureAuth, requireAuth } from "../plugins/auth.js";

const createApplicationSchema = z.object({
  name: z.string().min(1).max(120),
  organizationId: z.string().uuid().optional(),
});

export function applicationRoutes(_env: Env): FastifyPluginAsync {
  return async (app) => {
    app.get(
      "/api/v1/applications",
      { preHandler: requireAuth },
      async (request) => {
        ensureAuth(request);

        const memberships = await prisma.organizationMember.findMany({
          where: { platformUserId: request.auth.platformUserId },
          select: { organizationId: true, role: true },
        });

        const orgIds = memberships.map((m) => m.organizationId);
        if (orgIds.length === 0) {
          return { applications: [] };
        }

        const applications = await prisma.application.findMany({
          where: { organizationId: { in: orgIds } },
          orderBy: { createdAt: "desc" },
          include: {
            organization: { select: { id: true, name: true, slug: true } },
          },
        });

        const roleByOrg = new Map(
          memberships.map((m) => [m.organizationId, m.role]),
        );

        return {
          applications: applications.map((a) => ({
            id: a.id,
            name: a.name,
            slug: a.slug,
            createdAt: a.createdAt.toISOString(),
            organization: a.organization,
            viewerRole: roleByOrg.get(a.organizationId) ?? "MEMBER",
            canRequestDelete:
              roleByOrg.get(a.organizationId) === "OWNER" ||
              roleByOrg.get(a.organizationId) === "ADMIN",
          })),
        };
      },
    );

    app.post(
      "/api/v1/applications",
      { preHandler: requireAuth },
      async (request, reply) => {
        ensureAuth(request);
        assertTrustedOrigin(request, _env.WEB_ORIGIN);

        const body = createApplicationSchema.parse(request.body);

        const memberships = await prisma.organizationMember.findMany({
          where: { platformUserId: request.auth.platformUserId },
          orderBy: { createdAt: "asc" },
        });

        if (memberships.length === 0) {
          throw new AppError(403, "FORBIDDEN", "No organization membership");
        }

        const membership = body.organizationId
          ? memberships.find((m) => m.organizationId === body.organizationId)
          : memberships[0];

        if (!membership) {
          throw new AppError(404, "NOT_FOUND", "Organization not found");
        }

        if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
          throw new AppError(
            403,
            "FORBIDDEN",
            "Only OWNER or ADMIN can create applications",
          );
        }

        const baseSlug = slugify(body.name) || "application";
        let slug = baseSlug;
        let attempt = 0;
        while (
          await prisma.application.findUnique({
            where: {
              organizationId_slug: {
                organizationId: membership.organizationId,
                slug,
              },
            },
          })
        ) {
          attempt += 1;
          slug = `${baseSlug}-${attempt}`;
        }

        const application = await prisma.application.create({
          data: {
            organizationId: membership.organizationId,
            name: body.name.trim(),
            slug,
          },
          include: {
            organization: { select: { id: true, name: true, slug: true } },
          },
        });

        return reply.status(201).send({
          application: {
            id: application.id,
            name: application.name,
            slug: application.slug,
            createdAt: application.createdAt.toISOString(),
            organization: application.organization,
            viewerRole: membership.role,
            canRequestDelete: true,
          },
        });
      },
    );
  };
}
