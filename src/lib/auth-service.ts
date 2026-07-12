export type AuthUser = { id: string; email: string; fullNameEn: string; fullNameAr: string };

export type RegistrationInput = {
  email: string;
  password: string;
  fullNameEn: string;
  fullNameAr: string;
};

export type AuthSession = {
  user: AuthUser;
  createdAt: string;
};

export type AuthErrorCode = "EMAIL_EXISTS" | "INVALID_CREDENTIALS" | "STORAGE_ERROR";

export class AuthError extends Error {
  constructor(public readonly code: AuthErrorCode) {
    super(code);
    this.name = "AuthError";
  }
}

export interface AuthService {
  register(input: RegistrationInput): Promise<AuthSession>;
  login(email: string, password: string): Promise<AuthSession>;
  logout(): Promise<void>;
  getSession(): Promise<AuthSession | null>;
}
