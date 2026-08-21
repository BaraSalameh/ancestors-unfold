import type { z } from "zod";

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly payload?: unknown,
  ) {
    super(code);
    this.name = "ApiClientError";
  }
}

type ApiRequestOptions = Omit<RequestInit, "body"> & { body?: unknown };

async function apiRequest(path: string, options: ApiRequestOptions = {}): Promise<unknown> {
  const headers = new Headers(options.headers);
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  if (body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(path, {
    ...options,
    body,
    headers,
    credentials: options.credentials ?? "include",
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const code =
      payload &&
      typeof payload === "object" &&
      "code" in payload &&
      typeof payload.code === "string"
        ? payload.code
        : "REQUEST_FAILED";
    throw new ApiClientError(code, response.status, payload);
  }
  return payload;
}

export async function validatedApiRequest<Schema extends z.ZodTypeAny>(
  schema: Schema,
  path: string,
  options: ApiRequestOptions = {},
): Promise<z.output<Schema>> {
  return schema.parse(await apiRequest(path, options));
}
