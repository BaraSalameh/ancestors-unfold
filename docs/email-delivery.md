# Transactional email delivery

Authentication email is printed to the server terminal by default. To send real email with Resend, configure the production environment:

```env
AUTH_TOKEN_DELIVERY=resend
RESEND_API_KEY=re_...
EMAIL_FROM=Ancestors Unfold <accounts@your-verified-domain.example>
EMAIL_CODE_SECRET=a-stable-random-secret-of-at-least-16-characters
PUBLIC_ORIGIN=https://your-public-application-origin.example
REQUIRED_MIGRATIONS=4
```

Verify the `EMAIL_FROM` domain in Resend before enabling delivery. `PUBLIC_ORIGIN` is used to construct password-reset links and must exactly match the application's public origin. Keep `EMAIL_CODE_SECRET` stable and private because rotating it invalidates outstanding six-digit codes.

For local testing, leave `AUTH_TOKEN_DELIVERY=console`; verification codes and reset links will appear only in the server terminal and will not reach an inbox.

## Development Gmail delivery

The development server can send real mail from `noreplyfamilytree1@gmail.com` over Gmail SMTP:

```env
AUTH_TOKEN_DELIVERY=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreplyfamilytree1@gmail.com
SMTP_PASS=your-google-app-password
EMAIL_FROM="Ancestors Unfold <noreplyfamilytree1@gmail.com>"
EMAIL_CODE_SECRET=a-stable-random-secret-of-at-least-16-characters
```

Enable two-step verification on the Google account and create an app password for `SMTP_PASS`. Do not use the normal Google account password or commit the app password.
