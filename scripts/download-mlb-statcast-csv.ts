import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? "";
}

function requireHttpUrl(url: string) {
  if (!url.startsWith("https://")) throw new Error("Only https:// URLs are allowed.");
  if (!url.includes("baseballsavant.mlb.com")) throw new Error("Use a Baseball Savant Statcast CSV export URL.");
  return url;
}

async function main() {
  const url = requireHttpUrl(argValue("url"));
  const outPath = argValue("out") || path.join(process.cwd(), "data", "mlb", "statcast.csv");
  const response = await fetch(url, {
    headers: {
      "accept": "text/csv,*/*",
      "user-agent": "SharkEdge research feed builder"
    }
  });
  if (!response.ok) throw new Error(`Statcast CSV download failed: ${response.status} ${response.statusText}`);
  const csv = await response.text();
  if (!csv.includes("pitch_type") || !csv.includes("batter") || !csv.includes("pitcher")) {
    throw new Error("Downloaded file does not look like a Statcast CSV export.");
  }
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, csv, "utf8");
  console.log(JSON.stringify({ outPath, bytes: csv.length }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
