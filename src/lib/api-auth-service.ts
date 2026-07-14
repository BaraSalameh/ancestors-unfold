import { AuthError, type AuthService, type AuthSession, type RegistrationInput } from "./auth-service";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "include", headers: { "content-type": "application/json", ...init?.headers } });
  if (response.ok) return response.json() as Promise<T>;
  const value = await response.json().catch(() => ({})) as { code?: string };
  if (value.code === "EMAIL_EXISTS") throw new AuthError("EMAIL_EXISTS");
  if (value.code === "INVALID_CREDENTIALS") throw new AuthError("INVALID_CREDENTIALS");
  throw new AuthError("STORAGE_ERROR");
}

export const apiAuthService: AuthService = {
  register(input: RegistrationInput) { return call<AuthSession>("/api/auth/register", { method: "POST", body: JSON.stringify(input) }); },
  login(email: string, password: string) { return call<AuthSession>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }); },
  logout() { return call<void>("/api/auth/logout", { method: "POST" }); },
  getSession() { return call<AuthSession | null>("/api/auth/session"); },
};
