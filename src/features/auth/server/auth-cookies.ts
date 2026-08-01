const SESSION_COOKIE = "ancestors_session";
export const OAUTH_COOKIE = "ancestors_google_oauth";

export const cookieNamed = (request: Request, name: string) =>
  request.headers
    .get("cookie")
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);

export const sessionTokenFrom = (request: Request) => cookieNamed(request, SESSION_COOKIE);

const secureAttribute = () => (process.env.SESSION_COOKIE_SECURE === "true" ? "; Secure" : "");

export const sessionCookie = (token: string, maxAge: number) =>
  `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureAttribute()}`;

export const oauthCookie = (value: string, maxAge: number) =>
  `${OAUTH_COOKIE}=${value}; Path=/api/auth/google/callback; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureAttribute()}`;
