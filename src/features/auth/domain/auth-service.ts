export type AuthUser = { id: string; email: string; fullNameEn: string; fullNameAr: string };

export type RegistrationInput = {
  email: string;
  password: string;
  fullNameEn: string;
  fullNameAr: string;
  gender: "male" | "female";
  invitationToken?: string;
};

export type AuthSession = {
  user: AuthUser;
  createdAt: string;
  showGoogleWelcome?: boolean;
};
export type RegistrationResult = { verificationRequired: true; email: string };

export type AuthErrorCode =
  | "EMAIL_EXISTS"
  | "INVALID_CREDENTIALS"
  | "INVALID_INPUT"
  | "RATE_LIMITED"
  | "EMAIL_NOT_VERIFIED"
  | "INVALID_OR_EXPIRED_CODE"
  | "INVALID_OR_EXPIRED_TOKEN"
  | "RESEND_TOO_SOON"
  | "DELIVERY_FAILED"
  | "SERVICE_UNAVAILABLE"
  | "INVALID_INVITATION"
  | "INVITEE_ALREADY_REGISTERED"
  | "STORAGE_ERROR";

export class AuthError extends Error {
  constructor(public readonly code: AuthErrorCode) {
    super(code);
    this.name = "AuthError";
  }
}

export interface AuthService {
  register(input: RegistrationInput): Promise<RegistrationResult>;
  confirmEmail(email: string, code: string): Promise<AuthSession>;
  resendEmailCode(email: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  confirmPasswordReset(token: string, password: string): Promise<void>;
  requestEmailChange(email: string, currentPassword: string): Promise<void>;
  confirmEmailChange(code: string): Promise<AuthSession>;
  login(email: string, password: string): Promise<AuthSession>;
  logout(): Promise<void>;
  getSession(): Promise<AuthSession | null>;
}
