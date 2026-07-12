# Future authentication backend requirements

The current browser auth adapter is development-only. Google authentication, password recovery, and authenticator-app two-factor authentication must only become functional after a secure server and database are available.

## Identity and OAuth

- Store normalized email addresses with a database uniqueness constraint.
- Store the user's English and Arabic full names as separate required profile fields.
- Store OAuth provider and provider account ID as a unique pair; do not treat an email returned by a provider as the provider identity.
- Define an explicit, verified-email-based account-linking policy before enabling Google sign-in.

## Password recovery

- Store only a cryptographic hash of each reset token, together with user ID, expiry, creation time, and consumed time.
- Make tokens short-lived, single-use, and invalidate existing sessions after a successful password reset.

## Authenticator-app 2FA

- Use standards-based TOTP. Generate secrets on the server using a cryptographically secure random source.
- Encrypt TOTP secrets at rest with a managed server-side key. A TOTP secret cannot usefully be stored as a one-way password hash because it is required to verify codes.
- Keep setup pending until the user confirms a valid six-digit TOTP code; record enabled and confirmed timestamps only after confirmation.
- Generate one-time recovery codes after confirmation. Store only their hashes and record individual consumed timestamps.
- Require a valid password or TOTP code before disabling 2FA or regenerating recovery codes.
- Rate-limit setup confirmation, login verification, recovery-code use, and disabling attempts.
- Record security audit events for setup, confirmation, verification failures, recovery-code generation/use, disabling, and account recovery.

## Planned service operations

The backend adapter will eventually add `beginTotpSetup`, `confirmTotpSetup`, `verifyTotp`, `regenerateRecoveryCodes`, and `disableTotp`. These methods must not be added as client-side no-ops before the backend exists.
