import { PrismaClient } from "@prisma/client";

/**
 * Development hot-reload can re-evaluate modules repeatedly.
 * Reuse a single PrismaClient on globalThis to avoid exhausting DB connections.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient };
export type { Organization, Application, Prisma } from "@prisma/client";
