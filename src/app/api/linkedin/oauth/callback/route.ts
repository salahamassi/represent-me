/**
 * Phase 9a — OAuth callback route.
 *
 *   GET /api/linkedin/oauth/callback?code=...&state=...
 *
 * Three-step landing for the OAuth dance:
 *
 *   1. Verify the state cookie matches the query `state`. Mismatches
 *      mean either CSRF or a stale cookie — fail loudly.
 *   2. Exchange the authorization code for an access + refresh token.
 *   3. Hit `/v2/userinfo` to grab the member URN (`sub` claim, prefixed
 *      with `urn:li:person:`).
 *
 * Persists all of that to `linkedin_auth` (single-row table) and shows
 * a small success page so the user knows they can close the tab.
 *
 * Errors are surfaced in plain HTML — this is a one-shot setup flow,
 * a JSON 500 wouldn't help the human running it.
 */

import { NextRequest } from "next/server";
import { setLinkedInAuth } from "@/lib/db";

export const runtime = "nodejs";

const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const REDIRECT_URI = "http://localhost:3000/api/linkedin/oauth/callback";

interface LinkedInTokenResponse {
  access_token: string;
  /** Optional — self-serve "Share on LinkedIn" apps don't get refresh
   *  tokens. Only Marketing Developer Platform (partner tier) does.
   *  Without it, the user re-runs the OAuth flow every ~60 days. */
  refresh_token?: string;
  expires_in: number;
  refresh_token_expires_in?: number;
  scope: string;
  token_type: string;
}

interface LinkedInUserInfo {
  sub: string;
  name?: string;
  email?: string;
}

function htmlPage(title: string, body: string, isError = false): Response {
  const accent = isError ? "#ef4444" : "#22d3ee";
  return new Response(
    `<!doctype html>
<html><head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #0f172a; color: #f1f5f9; padding: 60px; max-width: 720px; margin: 0 auto; }
  h1 { color: ${accent}; margin-bottom: 16px; }
  pre { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px; font-family: 'JetBrains Mono', monospace; font-size: 13px; overflow-x: auto; }
  code { color: ${accent}; }
  a { color: ${accent}; }
</style>
</head><body>
<h1>${title}</h1>
${body}
</body></html>`,
    { status: isError ? 400 : 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // 1. LinkedIn surfaced an error directly (user denied, expired, etc.)
  if (error) {
    return htmlPage(
      "LinkedIn OAuth failed",
      `<p>LinkedIn returned an error during authorization:</p>
       <pre><code>${error}</code>
${errorDescription || ""}</pre>
       <p><a href="/api/linkedin/oauth/start">Try again</a></p>`,
      true
    );
  }

  if (!code || !state) {
    return htmlPage(
      "Missing code or state",
      `<p>The callback URL is missing required parameters. Run the
       flow from the start: <a href="/api/linkedin/oauth/start">/api/linkedin/oauth/start</a>.</p>`,
      true
    );
  }

  // 2. Verify CSRF state cookie.
  const cookieState = request.cookies.get("linkedin_oauth_state")?.value;
  if (!cookieState || cookieState !== state) {
    return htmlPage(
      "State mismatch",
      `<p>The CSRF state cookie didn't match the callback query param.
       This can mean the cookie expired (10-minute window), the flow
       was started in a different browser, or someone tampered with
       the URL.</p>
       <p><a href="/api/linkedin/oauth/start">Restart the flow</a></p>`,
      true
    );
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return htmlPage(
      "Env vars missing",
      `<p><code>LINKEDIN_CLIENT_ID</code> and/or
       <code>LINKEDIN_CLIENT_SECRET</code> are not set. Add them to
       <code>.env.local</code> and restart the dev server.</p>`,
      true
    );
  }

  // 3. Exchange the code for tokens.
  let tokenJson: LinkedInTokenResponse;
  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return htmlPage(
        "Token exchange failed",
        `<p>LinkedIn rejected the authorization code.</p>
         <pre>HTTP ${tokenRes.status}
${text.slice(0, 800)}</pre>
         <p><a href="/api/linkedin/oauth/start">Restart the flow</a></p>`,
        true
      );
    }
    tokenJson = (await tokenRes.json()) as LinkedInTokenResponse;
  } catch (err) {
    return htmlPage(
      "Token exchange threw",
      `<pre>${err instanceof Error ? err.message : String(err)}</pre>`,
      true
    );
  }

  // 4. Fetch the member URN via OpenID userinfo. The `sub` claim is
  // the LinkedIn member id; we prefix it with the URN namespace.
  let userInfo: LinkedInUserInfo;
  try {
    const userInfoRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!userInfoRes.ok) {
      const text = await userInfoRes.text();
      return htmlPage(
        "userinfo fetch failed",
        `<p>Couldn't read the OpenID userinfo endpoint to derive the
         member URN.</p>
         <pre>HTTP ${userInfoRes.status}
${text.slice(0, 800)}</pre>`,
        true
      );
    }
    userInfo = (await userInfoRes.json()) as LinkedInUserInfo;
  } catch (err) {
    return htmlPage(
      "userinfo threw",
      `<pre>${err instanceof Error ? err.message : String(err)}</pre>`,
      true
    );
  }

  if (!userInfo.sub) {
    return htmlPage(
      "No sub in userinfo",
      `<p>LinkedIn's userinfo response didn't include a <code>sub</code>
       claim. This usually means the "Sign In with LinkedIn using
       OpenID Connect" product wasn't added to the app.</p>
       <pre>${JSON.stringify(userInfo, null, 2)}</pre>`,
      true
    );
  }

  const memberUrn = `urn:li:person:${userInfo.sub}`;
  const expiresAt = new Date(
    Date.now() + tokenJson.expires_in * 1000
  ).toISOString();
  // Self-serve apps get no refresh token — we persist null and warn
  // the user that they'll re-auth in ~60 days.
  const refreshToken = tokenJson.refresh_token ?? null;

  // 5. Persist.
  setLinkedInAuth({
    accessToken: tokenJson.access_token,
    refreshToken,
    expiresAt,
    memberUrn,
    scope: tokenJson.scope,
  });

  // 6. Render success page. Token contents intentionally NOT echoed —
  // they end up in shell history / log files if shown, even briefly.
  // The DB write is the proof.
  const refreshLine = refreshToken
    ? `refresh_valid: ~${
        tokenJson.refresh_token_expires_in
          ? Math.round(tokenJson.refresh_token_expires_in / 86400)
          : 365
      } days (auto-rotates the access token)`
    : `refresh_token: not granted (self-serve apps don't get one — re-run /api/linkedin/oauth/start before ${expiresAt.split("T")[0]} to renew)`;
  return htmlPage(
    "✓ Connected to LinkedIn",
    `<p>Tokens persisted. You can close this tab and return to the
     dashboard.</p>
     <pre>member_urn:    ${memberUrn}
display_name:  ${userInfo.name || "(not provided)"}
expires_at:    ${expiresAt}
${refreshLine}
scope:         ${tokenJson.scope}</pre>
     <p>Re-run <a href="/api/linkedin/oauth/start">the flow</a> any
     time to refresh credentials.</p>`,
    false
  );
}
