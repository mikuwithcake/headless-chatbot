import { config } from "dotenv";
config();

const action = process.argv[2];
if (action !== "draw" && action !== "clear") {
  console.error("Usage: node scripts/raffle.mjs <draw|clear>");
  process.exit(1);
}

const host = process.env.OVERLAY_HOST?.trim() || "127.0.0.1";
const port = process.env.OVERLAY_PORT?.trim() || "3847";
const url = `http://${host}:${port}/api/${action}`;

try {
  const res = await fetch(url, { method: "POST" });
  const body = await res.json();

  if (action === "draw") {
    if (body.ok) {
      const tally = body.wins ? ` (win #${body.wins})` : "";
      const last = body.previousWonAt ? `, last won ${body.previousWonAt}` : "";
      console.log(`Winner: ${body.winner}${tally}${last}`);
      console.log("Submissions are now closed — run raffle:clear to reopen.");
    } else {
      console.log("No entries in the raffle.");
    }
  } else {
    console.log("Raffle cleared.");
  }
} catch (err) {
  console.error(`Failed to reach ${url} — is the bot running?`);
  process.exit(1);
}
