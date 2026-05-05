/**
 * Phase 9a — OAuth start route.
 *
 *   GET /api/linkedin/oauth/start
 *
 * Builds the LinkedIn 3-legged OAuth authorization URL with the
 * scopes we need (`w_member_social` for posting, `openid profile email`
 * for fetching the member URN), generates a CSRF state nonce, sets it
 * as an httpOnly cookie, and 302-redirects the browser to LinkedIn's
 * consent screen.
 *
 * On consent, LinkedIn calls back to
 * `/api/linkedin/oauth/callback?code=...&state=...`. The callback
 * verifies the state cookie, exchanges the code for tokens, and
 * persists them via `setLinkedInAuth`.
 *
 * No DB writes happen here — only the kickoff redirect.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";

const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const REDIRECT_URI = "http://localhost:3000/api/linkedin/oauth/callback";
const SCOPES = "openid profile email w_member_social";

export async function GET(request: NextRequest) {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      {
        error:
          "LINKEDIN_CLIENT_ID not set in env. Restart the dev server after adding it to .env.local.",
      },
      { status: 500 }
    );
  }

  // 32-byte random state — verified on the callback to prevent CSRF.
  // We don't need cryptographic strength here, but `randomBytes` is
  // already in scope and short-circuits the question.
  const state = randomBytes(32).toString("hex");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    state,
    scope: SCOPES,
  });

  const authorizeUrl = `${AUTHORIZE_URL}?${params.toString()}`;
  // Keep the user-supplied `from` query param (if any) so the callback
  // can bounce back to wherever they started. Defaults to `/`.
  const from = request.nextUrl.searchParams.get("from") || "/";

  const response = NextResponse.redirect(authorizeUrl);
  // httpOnly + sameSite=lax — the cookie is read on the LinkedIn-back
  // request which is a top-level navigation, so `lax` is enough.
  // 10-minute expiry is a generous OAuth round-trip budget.
  response.cookies.set("linkedin_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/api/linkedin/oauth",
  });
  response.cookies.set("linkedin_oauth_from", from, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/api/linkedin/oauth",
  });
  return response;
}
