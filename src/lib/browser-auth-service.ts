import { AuthError, type AuthService, type AuthSession } from "./auth-service";

// Development-only persistence. This adapter is intentionally replaceable and is
// not a substitute for server-side authentication and a database in production.
type StoredAccount = { id: string; email: string; passwordHash: string; salt: string; fullNameEn?: string; fullNameAr?: string };

const ACCOUNTS_KEY = "ancestors-unfold:auth:accounts:v1";
const SESSION_KEY = "ancestors-unfold:auth:session:v1";

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

async function hashPassword(password: string, salt: string) {
  const bytes = new TextEncoder().encode(`${salt}:${password}`);
  return toBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

function readAccounts(): StoredAccount[] {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "[]") as StoredAccount[];
  } catch {
    throw new AuthError("STORAGE_ERROR");
  }
}

export const browserAuthService: AuthService = {
  async register(input) {
    const email = normalizeEmail(input.email);
    const accounts = readAccounts();
    if (accounts.some((account) => account.email === email)) throw new AuthError("EMAIL_EXISTS");

    const salt = crypto.randomUUID();
    const account: StoredAccount = {
      id: crypto.randomUUID(),
      email,
      fullNameEn: input.fullNameEn.trim(),
      fullNameAr: input.fullNameAr.trim(),
      salt,
      passwordHash: await hashPassword(input.password, salt),
    };
    const session: AuthSession = {
      user: { id: account.id, email: account.email, fullNameEn: account.fullNameEn ?? "", fullNameAr: account.fullNameAr ?? "" },
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([...accounts, account]));
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  },

  async login(rawEmail, password) {
    const email = normalizeEmail(rawEmail);
    const account = readAccounts().find((candidate) => candidate.email === email);
    if (!account || (await hashPassword(password, account.salt)) !== account.passwordHash) {
      throw new AuthError("INVALID_CREDENTIALS");
    }
    const session: AuthSession = {
      user: { id: account.id, email: account.email, fullNameEn: account.fullNameEn ?? "", fullNameAr: account.fullNameAr ?? "" },
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  },

  async logout() {
    localStorage.removeItem(SESSION_KEY);
  },

  async getSession() {
    try {
      const value = localStorage.getItem(SESSION_KEY);
      if (!value) return null;
      const session = JSON.parse(value) as AuthSession;
      const account = readAccounts().find(
        (account) => account.id === session.user.id && account.email === session.user.email,
      );
      if (!account) localStorage.removeItem(SESSION_KEY);
      if (!account) return null;
      const restored: AuthSession = { ...session, user: { id: account.id, email: account.email, fullNameEn: account.fullNameEn ?? "", fullNameAr: account.fullNameAr ?? "" } };
      localStorage.setItem(SESSION_KEY, JSON.stringify(restored));
      return restored;
    } catch {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  },
};
