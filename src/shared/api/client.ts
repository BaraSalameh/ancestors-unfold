export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = "ApiClientError";
  }
}

type ApiRequestOptions = Omit<RequestInit, "body"> & { body?: unknown };

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
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
    throw new ApiClientError(code, response.status);
  }
  return payload as T;
}
