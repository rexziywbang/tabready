import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const dataDirectory = path.join(process.cwd(), "data");
const databaseFiles = [
  "tabready.db",
  "tabready.db-shm",
  "tabready.db-wal",
].map((name) => path.join(dataDirectory, name));
for (const databaseFile of databaseFiles) {
  if (fs.existsSync(databaseFile)) fs.rmSync(databaseFile);
}

execFileSync(
  process.execPath,
  ["--import", "tsx", "scripts/make-fixtures.ts"],
  { cwd: process.cwd(), stdio: "inherit" },
);
execFileSync(process.execPath, ["--import", "tsx", "src/db/seed.ts"], {
  cwd: process.cwd(),
  stdio: "inherit",
});
console.log("TABReady demo data is ready.");
