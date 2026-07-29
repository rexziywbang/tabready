import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const databasePath =
  process.env.TABREADY_DB_PATH ??
  path.join(process.cwd(), "data", "tabready.db");

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

export const sqlite = new Database(databasePath);
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });

export function ensureDatabase(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      client_name TEXT NOT NULL,
      tolerance_pct REAL NOT NULL DEFAULT 10,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      sheet_name TEXT NOT NULL,
      mapping_json TEXT NOT NULL,
      imported_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS air_systems (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      unit_id TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      design_total_cfm REAL
    );
    CREATE TABLE IF NOT EXISTS outlets (
      id TEXT PRIMARY KEY,
      air_system_id TEXT NOT NULL REFERENCES air_systems(id) ON DELETE CASCADE,
      import_batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
      outlet_id TEXT,
      area_served TEXT,
      outlet_type TEXT,
      size TEXT,
      design_cfm TEXT,
      final_cfm TEXT,
      instrument_name TEXT,
      technician TEXT,
      test_date TEXT,
      remarks TEXT,
      raw_row_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS instruments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      serial TEXT NOT NULL,
      calibration_date TEXT NOT NULL,
      calibration_interval_months INTEGER NOT NULL DEFAULT 12
    );
    CREATE TABLE IF NOT EXISTS findings (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      rule_id TEXT NOT NULL,
      rule_version TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('error', 'warning')),
      outlet_id TEXT REFERENCES outlets(id) ON DELETE CASCADE,
      air_system_id TEXT REFERENCES air_systems(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      inputs_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
      resolution_note TEXT,
      resolved_by TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE TABLE IF NOT EXISTS report_versions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      open_errors INTEGER NOT NULL,
      open_warnings INTEGER NOT NULL,
      generated_at TEXT NOT NULL,
      UNIQUE(project_id, version_number)
    );
    CREATE INDEX IF NOT EXISTS idx_systems_project ON air_systems(project_id);
    CREATE INDEX IF NOT EXISTS idx_outlets_system ON outlets(air_system_id);
    CREATE INDEX IF NOT EXISTS idx_findings_project ON findings(project_id);
    CREATE INDEX IF NOT EXISTS idx_reports_project ON report_versions(project_id);
  `);
}

ensureDatabase();
