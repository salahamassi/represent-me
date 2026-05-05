/**
 * Phase 9b — LinkedIn document publisher (direct API).
 *
 * Three REST calls per publish, in this order:
 *
 *   1. POST /rest/documents?action=initializeUpload
 *      Returns an uploadUrl + the document URN. The uploadUrl is a
 *      pre-signed PUT target — we don't need an Authorization header
 *      on the upload itself.
 *
 *   2. PUT <uploadUrl>
 *      Stream the PDF bytes. LinkedIn validates the upload and
 *      associates them with the document URN from step 1.
 *
 *   3. POST /rest/posts
 *      Publish (or save as draft) the actual post with the document
 *      URN as the attached media. LinkedIn returns the post URN in
 *      the `x-restli-id` response header.
 *
 * No refresh-token rotation here — self-serve apps don't get refresh
 * tokens. When the access token nears expiry, the publisher throws a
 * loud error telling the caller to re-run /api/linkedin/oauth/start.
 *
 * All HTTP calls use the LinkedIn-Version header pinned to 202604;
 * LinkedIn sunsets old versions quarterly, so update this constant
 * periodically.
 */

import { readFile } from "node:fs/promises";
import { getLinkedInAuth, type LinkedInAuth } from "@/lib/db";

const API_BASE = "https://api.linkedin.com/rest";
const LINKEDIN_VERSION = "202604";

// 24-hour buffer — within this window without a refresh token we
// surface a re-auth prompt rather than risk a 401 mid-publish.
const ACCESS_TOKEN_EXPIRY_BUFFER_MS = 24 * 60 * 60 * 1000;

export type LifecycleState = "PUBLISHED" | "DRAFT";

export interface PublishCarouselInput {
  /** For naming + telemetry; not sent to LinkedIn. */
  contentId: number;
  /** Post body — Layla's narrative rewrite, plain text, no markdown. */
  postText: string;
  /** Absolute disk path to the carousel PDF. */
  pdfPath: string;
  /** Title shown above the document inside LinkedIn's viewer. */
  title: string;
  /** Default DRAFT for safety on first runs; switch to PUBLISHED for
   *  the real automation flow. */
  lifecycleState?: LifecycleState;
}

export interface PublishCarouselResult {
  ok: boolean;
  /** `urn:li:ugcPost:<id>` or `urn:li:share:<id>` from LinkedIn. */
  postUrn?: string;
  /** Public-facing LinkedIn URL for the post. Only meaningful for
   *  PUBLISHED state — DRAFT posts don't have a public URL. */
  postUrl?: string;
  /** Document URN — `urn:li:document:<id>`. Persisted for telemetry
   *  so we can re-attach to a different post if needed. */
  documentUrn?: string;
  /** End-to-end ms across all three calls. */
  durationMs?: number;
  /** Set on `ok: false`. Specific enough that the caller can act
   *  (re-auth, retry, escalate). */
  error?: string;
  /** True when the failure was an auth issue (401 or expiry buffer)
   *  — the caller can prompt the user to re-run /oauth/start. */
  needsReauth?: boolean;
}

/**
 * Read the access token, throw if missing or near expiry. Self-serve
 * apps have no refresh path; expiry = re-auth.
 */
function getValidAuth(): LinkedInAuth {
  const auth = getLinkedInAuth();
  if (!auth) {
    throw new LinkedInAuthError(
      "Not connected to LinkedIn. Visit /api/linkedin/oauth/start to authorize."
    );
  }
  const expiresMs = Date.parse(auth.expiresAt);
  if (!Number.isFinite(expiresMs)) {
    throw new LinkedInAuthError(
      `Stored expires_at is malformed: "${auth.expiresAt}". Re-run /api/linkedin/oauth/start.`
    );
  }
  const now = Date.now();
  if (expiresMs <= now) {
    throw new LinkedInAuthError(
      `LinkedIn access token expired at ${auth.expiresAt}. Re-run /api/linkedin/oauth/start.`
    );
  }
  if (expiresMs - now <= ACCESS_TOKEN_EXPIRY_BUFFER_MS) {
    // Self-serve has no refresh. Loud warning so the caller surfaces it.
    console.warn(
      `[linkedin] access token expires in <24h (at ${auth.expiresAt}). Re-run /oauth/start soon.`
    );
  }
  return auth;
}

/** Distinguished error type so the route handler can flip the
 *  `needsReauth` flag without parsing strings. */
export class LinkedInAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinkedInAuthError";
  }
}

interface InitializeUploadResponse {
  value: {
    uploadUrl: string;
    document: string; // urn:li:document:<id>
  };
}

/**
 * Step 1 — ask LinkedIn for a pre-signed upload URL + a document URN
 * we can later attach to a post.
 */
async function initializeUpload(
  auth: LinkedInAuth
): Promise<InitializeUploadResponse["value"]> {
  const res = await fetch(`${API_BASE}/documents?action=initializeUpload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      initializeUploadRequest: { owner: auth.memberUrn },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`initializeUpload failed: HTTP ${res.status} — ${text.slice(0, 400)}`);
  }
  const json = (await res.json()) as InitializeUploadResponse;
  if (!json.value?.uploadUrl || !json.value?.document) {
    throw new Error(
      `initializeUpload returned malformed body: ${JSON.stringify(json).slice(0, 400)}`
    );
  }
  return json.value;
}

/**
 * Step 2 — PUT the PDF bytes to the pre-signed URL. No auth header
 * needed (the URL is signed); LinkedIn associates the upload with the
 * document URN from step 1.
 */
async function uploadPdf(uploadUrl: string, pdfBytes: Buffer): Promise<void> {
  // Buffer → Uint8Array view to satisfy strict BodyInit typing.
  const body = new Blob([pdfBytes as unknown as BlobPart], {
    type: "application/pdf",
  });
  const res = await fetch(uploadUrl, {
    method: "PUT",
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `uploadPdf failed: HTTP ${res.status} — ${text.slice(0, 400)}`
    );
  }
}

/**
 * Step 3 — create the actual post and attach the document by URN.
 * Returns the post URN. The caller derives the public URL from it.
 */
async function createPost(
  auth: LinkedInAuth,
  documentUrn: string,
  input: PublishCarouselInput
): Promise<string> {
  const lifecycleState: LifecycleState = input.lifecycleState ?? "DRAFT";
  const body = {
    author: auth.memberUrn,
    commentary: input.postText,
    visibility: "PUBLIC" as const,
    distribution: {
      feedDistribution: "MAIN_FEED" as const,
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    content: {
      media: {
        title: input.title,
        id: documentUrn,
      },
    },
    lifecycleState,
    isReshareDisabledByAuthor: false,
  };

  const res = await fetch(`${API_BASE}/posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `createPost failed: HTTP ${res.status} — ${text.slice(0, 600)}`
    );
  }
  // Post URN comes back in `x-restli-id` (preferred) or the response
  // body's `id` field. Try the header first.
  const postUrn = res.headers.get("x-restli-id");
  if (postUrn) return postUrn;
  const json = (await res.json().catch(() => null)) as { id?: string } | null;
  if (json?.id) return json.id;
  throw new Error(
    "createPost succeeded but no post URN in response (checked x-restli-id header + body.id)"
  );
}

/** LinkedIn's public URL pattern for a feed item. The URN is embedded
 *  with its colons preserved — LinkedIn handles the encoding. */
function postUrlFromUrn(postUrn: string): string {
  return `https://www.linkedin.com/feed/update/${postUrn}/`;
}

/**
 * Read a post back by URN. Useful for verifying a draft that LinkedIn
 * doesn't render in the UI (DRAFT lifecycle state hides from the
 * web Manage Posts → Drafts list AND the public feed-update URL).
 *
 *   GET /rest/posts/{encoded-urn}
 *
 * Returns the raw post object — caller decides what to print.
 */
export async function readPost(
  postUrn: string
): Promise<{ ok: boolean; post?: unknown; error?: string }> {
  let auth: LinkedInAuth;
  try {
    auth = getValidAuth();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const encoded = encodeURIComponent(postUrn);
  const res = await fetch(`${API_BASE}/posts/${encoded}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    return {
      ok: false,
      error: `readPost failed: HTTP ${res.status} — ${text.slice(0, 400)}`,
    };
  }
  const post = await res.json();
  return { ok: true, post };
}

/**
 * Delete a post by URN. Idempotent in spirit — LinkedIn returns 204
 * on success, 404 if already gone (which we treat as success).
 *
 *   DELETE /rest/posts/{encoded-urn}
 *
 * Caller should clear `linkedin_post_url` on the matching content row
 * after a successful delete.
 */
export async function deletePost(
  postUrn: string
): Promise<{ ok: boolean; error?: string }> {
  let auth: LinkedInAuth;
  try {
    auth = getValidAuth();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const encoded = encodeURIComponent(postUrn);
  const res = await fetch(`${API_BASE}/posts/${encoded}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });
  // 204 No Content = deleted; 404 = already gone (treat as success).
  if (res.status === 204 || res.status === 404) {
    return { ok: true };
  }
  const text = await res.text();
  return {
    ok: false,
    error: `deletePost failed: HTTP ${res.status} — ${text.slice(0, 400)}`,
  };
}

/**
 * Top-level entry point. Three calls in sequence — fail fast on the
 * first error. Reads the PDF from disk so the caller can pass any
 * absolute path (carousel, archived doc, hand-edited PDF, etc.).
 */
export async function publishCarousel(
  input: PublishCarouselInput
): Promise<PublishCarouselResult> {
  const start = Date.now();
  const lifecycleState = input.lifecycleState ?? "DRAFT";

  let auth: LinkedInAuth;
  try {
    auth = getValidAuth();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      needsReauth: err instanceof LinkedInAuthError,
      durationMs: Date.now() - start,
    };
  }

  // Read the PDF off disk before talking to LinkedIn. If this fails
  // there's no point initialising the upload.
  let pdfBytes: Buffer;
  try {
    pdfBytes = await readFile(input.pdfPath);
  } catch (err) {
    return {
      ok: false,
      error: `Could not read PDF at ${input.pdfPath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
      durationMs: Date.now() - start,
    };
  }

  let initResult;
  try {
    initResult = await initializeUpload(auth);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `[step 1] ${message}`,
      // 401 in the message → flag re-auth.
      needsReauth: /HTTP 401/.test(message),
      durationMs: Date.now() - start,
    };
  }

  try {
    await uploadPdf(initResult.uploadUrl, pdfBytes);
  } catch (err) {
    return {
      ok: false,
      error: `[step 2] ${err instanceof Error ? err.message : String(err)}`,
      documentUrn: initResult.document,
      durationMs: Date.now() - start,
    };
  }

  let postUrn: string;
  try {
    postUrn = await createPost(auth, initResult.document, input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `[step 3] ${message}`,
      documentUrn: initResult.document,
      needsReauth: /HTTP 401/.test(message),
      durationMs: Date.now() - start,
    };
  }

  return {
    ok: true,
    postUrn,
    // DRAFT posts don't have a working public URL; only return one
    // for PUBLISHED state.
    postUrl: lifecycleState === "PUBLISHED" ? postUrlFromUrn(postUrn) : undefined,
    documentUrn: initResult.document,
    durationMs: Date.now() - start,
  };
}
