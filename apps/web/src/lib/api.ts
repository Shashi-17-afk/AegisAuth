/**
 * Browser API base URL.
 *
 * Browser traffic uses same-origin `/api/...`, handled by
 * `src/app/api/[...path]/route.ts`, which proxies to Fastify and preserves
 * Set-Cookie / Cookie headers. Do not call :3001 directly from the browser.
 */
function resolveApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "";
  }

  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
}

const API_URL = resolveApiBaseUrl();

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

type ApiOptions = {
  method?: string;
  body?: unknown;
};

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers: options.body
      ? { "Content-Type": "application/json", Accept: "application/json" }
      : { Accept: "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: "include",
  });

  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    statusCode?: number;
  };

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data.code ?? "REQUEST_FAILED",
      data.error ?? "Request failed",
    );
  }

  return data as T;
}

export { API_URL };
