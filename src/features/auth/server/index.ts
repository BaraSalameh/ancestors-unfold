export { normalizeEmail } from "./auth-crypto";
export { cookieNamed, oauthCookie, OAUTH_COOKIE, sessionCookie } from "./auth-cookies";
export { googleConfig, safeRedirect } from "./oauth-config";
export { authenticate, createSession, type Session } from "./session-service";
export { handleGoogleAuthRequest } from "./google-auth-handler";
export { handleCredentialRequest } from "./credential-handler";
export { handleRegistrationRequest } from "./registration-handler";
export { handleAccountRequest } from "./account-handler";
export {
  handleAuthenticatedSessionRequest,
  handleCurrentSessionRequest,
} from "./session-request-handler";
