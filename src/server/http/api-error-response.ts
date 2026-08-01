import { oauthCookie } from "@/features/auth/server";
import { jsonResponse as json } from "@/shared/http/response";
import { ApiError } from "../security";

type DatabaseError = { code?: string; constraint?: string };

function databaseError(error: unknown): DatabaseError | null {
  return typeof error === "object" && error !== null ? (error as DatabaseError) : null;
}

function uniqueConstraintResponse(error: DatabaseError | null): Response | null {
  if (error?.code !== "23505") return null;
  if (error.constraint === "users_email_uq") return json({ code: "EMAIL_EXISTS" }, 409);
  if (error.constraint === "branch_grants_one_active_editor_per_branch_uq") {
    return json({ code: "BRANCH_ALREADY_ASSIGNED" }, 409);
  }
  if (error.constraint === "tree_memberships_one_tree_per_user_uq") {
    return json({ code: "ONE_TREE_ACCOUNT" }, 409);
  }
  return null;
}

export function apiErrorResponse(error: unknown, pathname: string, requestId: string): Response {
  if (pathname === "/api/auth/google/callback") {
    return new Response(null, {
      status: 302,
      headers: {
        location: "/auth?oauth_error=failed",
        "set-cookie": oauthCookie("", 0),
        "cache-control": "no-store",
      },
    });
  }
  if (error instanceof ApiError) return json({ code: error.code, requestId }, error.status);

  const message = error instanceof Error ? error.message : "INTERNAL_ERROR";
  if (message === "EMAIL_EXISTS") return json({ code: "EMAIL_EXISTS" }, 409);
  const constraintResponse = uniqueConstraintResponse(databaseError(error));
  if (constraintResponse) return constraintResponse;
  if (message === "MAIL_NOT_CONFIGURED" || message === "MAIL_DELIVERY_FAILED") {
    return json({ code: "DELIVERY_FAILED" }, 503);
  }
  if (message === "DATABASE_NOT_CONFIGURED") return json({ code: message }, 503);
  if (message === "FORBIDDEN") return json({ code: message }, 403);
  return json({ code: "INTERNAL_ERROR", requestId }, 500);
}
