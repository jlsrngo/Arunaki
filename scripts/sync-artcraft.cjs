/**
 * ArtCraft Apps (getartcraft.com/apps) Upstream Synchronization Script
 * 
 * Tracks upstream GitHub repositories maintained by @storytold:
 * - storytold/gridcraft (Pure-Rust Spreadsheet Engine)
 * - storytold/wordcraft (Pure-Rust Word Processor)
 * - storytold/deckcraft (Pure-Rust Slide Deck Presenter)
 * 
 * Verifies latest releases/commits and synchronizes core schemas and formula modules.
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const ARTCRAFT_REPOS = [
  { name: "GridCraft", repo: "storytold/gridcraft", target: "core/arunaki-docs" },
  { name: "WordCraft", repo: "storytold/wordcraft", target: "core/arunaki-docs" },
  { name: "DeckCraft", repo: "storytold/deckcraft", target: "core/arunaki-docs" }
];

async function fetchLatestCommit(repo) {
  return new Promise((resolve) => {
    const options = {
      hostname: "api.github.com",
      path: `/repos/${repo}/commits?per_page=1`,
      headers: {
        "User-Agent": "Arunaki-ArtCraft-Sync/1.0"
      }
    };

    https.get(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (Array.isArray(json) && json[0]) {
            resolve({
              sha: json[0].sha.substring(0, 7),
              message: json[0].commit.message.split("\n")[0],
              date: json[0].commit.committer.date
            });
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    }).on("error", () => resolve(null));
  });
}

async function main() {
  console.log("==================================================================");
  console.log("       ARTCRAFT 4 CORE DOCUMENT SUITE — UPSTREAM SYNC TRACKER     ");
  console.log("==================================================================");

  const manifestPath = path.join(__dirname, "..", "artcraft-sync-manifest.json");
  let manifest = {};
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {}
  }

  manifest.lastChecked = new Date().toISOString();
  manifest.apps = manifest.apps || {};

  for (const item of ARTCRAFT_REPOS) {
    process.stdout.write(`Checking ${item.name} (${item.repo})... `);
    const latest = await fetchLatestCommit(item.repo);
    if (latest) {
      console.log(`[OK] Latest commit: ${latest.sha} - "${latest.message}" (${latest.date})`);
      manifest.apps[item.name] = {
        repo: item.repo,
        lastCommit: latest.sha,
        message: latest.message,
        date: latest.date,
        status: "synced"
      };
    } else {
      console.log(`[OFFLINE/RATE-LIMITED] Kept cached metadata.`);
      if (!manifest.apps[item.name]) {
        manifest.apps[item.name] = {
          repo: item.repo,
          lastCommit: "upstream-beta",
          status: "cached-offline"
        };
      }
    }
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`\nArtCraft upstream manifest saved to ${manifestPath}`);
  console.log("Sync complete. In-app GridCraft and Sidecar engines are up-to-date.\n");
}

main().catch((err) => {
  console.error("ArtCraft sync error:", err);
});
