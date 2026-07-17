import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Load monorepo-root env so NEXT_PUBLIC_API_URL is available without duplicating secrets.
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
loadEnv({ path: resolve(rootDir, ".env") });
loadEnv({ path: resolve(rootDir, ".env.local"), override: true });

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@aegisauth/shared"],
};

export default nextConfig;
