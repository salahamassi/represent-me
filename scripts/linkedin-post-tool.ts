/**
 * LinkedIn post utility — read or delete a post by URN.
 *
 *   npx tsx scripts/linkedin-post-tool.ts read   <urn>
 *   npx tsx scripts/linkedin-post-tool.ts delete <urn>
 *
 * Companion to scripts/test-linkedin-publish.ts. Used to:
 *   - Verify a DRAFT post landed correctly when LinkedIn's UI hides
 *     API-created drafts (the only way to "see" them is via the API).
 *   - Clean up after a botched LIVE post — DELETE /rest/posts/<urn>
 *     removes it within seconds, no public trail beyond the brief
 *     window it was visible.
 */

import {
  readPost,
  deletePost,
} from "@/services/linkedin-document-publisher";

async function main() {
  const action = process.argv[2];
  const urn = process.argv[3];

  if (!action || !urn) {
    console.error(
      "Usage:\n" +
        "  npx tsx scripts/linkedin-post-tool.ts read <urn>\n" +
        "  npx tsx scripts/linkedin-post-tool.ts delete <urn>"
    );
    process.exit(1);
  }

  if (!urn.startsWith("urn:li:")) {
    console.error(
      `URN should look like "urn:li:ugcPost:..." or "urn:li:share:..." — got "${urn}"`
    );
    process.exit(1);
  }

  if (action === "read") {
    const result = await readPost(urn);
    if (!result.ok) {
      console.error(`READ FAILED: ${result.error}`);
      process.exit(1);
    }
    console.log("READ OK\n");
    console.log(JSON.stringify(result.post, null, 2));
    return;
  }

  if (action === "delete") {
    const result = await deletePost(urn);
    if (!result.ok) {
      console.error(`DELETE FAILED: ${result.error}`);
      process.exit(1);
    }
    console.log(`✓ Deleted ${urn}`);
    return;
  }

  console.error(`Unknown action "${action}". Expected "read" or "delete".`);
  process.exit(1);
}

main().catch((err) => {
  console.error("threw:", err);
  process.exit(1);
});
