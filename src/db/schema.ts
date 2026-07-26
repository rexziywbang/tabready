import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  clientName: text("client_name").notNull(),
  tolerancePct: real("tolerance_pct").notNull().default(10),
  createdAt: text("created_at").notNull(),
});

export const importBatches = sqliteTable("import_batches", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  sheetName: text("sheet_name").notNull(),
  mappingJson: text("mapping_json").notNull(),
  importedAt: text("imported_at").notNull(),
});

export const airSystems = sqliteTable("air_systems", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  unitId: text("unit_id").notNull(),
  description: text("description").notNull().default(""),
  designTotalCfm: real("design_total_cfm"),
});

export const outlets = sqliteTable("outlets", {
  id: text("id").primaryKey(),
  airSystemId: text("air_system_id")
    .notNull()
    .references(() => airSystems.id, { onDelete: "cascade" }),
  importBatchId: text("import_batch_id")
    .notNull()
    .references(() => importBatches.id, { onDelete: "cascade" }),
  outletId: text("outlet_id"),
  areaServed: text("area_served"),
  outletType: text("outlet_type"),
  size: text("size"),
  designCfm: text("design_cfm"),
  finalCfm: text("final_cfm"),
  instrumentName: text("instrument_name"),
  technician: text("technician"),
  testDate: text("test_date"),
  remarks: text("remarks"),
  rawRowJson: text("raw_row_json").notNull(),
});

export const instruments = sqliteTable("instruments", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  type: text("type").notNull(),
  serial: text("serial").notNull(),
  calibrationDate: text("calibration_date").notNull(),
  calibrationIntervalMonths: integer("calibration_interval_months")
    .notNull()
    .default(12),
});

export const findings = sqliteTable("findings", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  ruleId: text("rule_id").notNull(),
  ruleVersion: text("rule_version").notNull(),
  severity: text("severity", { enum: ["error", "warning"] }).notNull(),
  outletId: text("outlet_id").references(() => outlets.id, {
    onDelete: "cascade",
  }),
  airSystemId: text("air_system_id").references(() => airSystems.id, {
    onDelete: "cascade",
  }),
  message: text("message").notNull(),
  inputsJson: text("inputs_json").notNull(),
  status: text("status", {
    enum: ["open", "acknowledged", "resolved"],
  })
    .notNull()
    .default("open"),
  resolutionNote: text("resolution_note"),
  resolvedBy: text("resolved_by"),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
});

export const reportVersions = sqliteTable("report_versions", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
  openErrors: integer("open_errors").notNull(),
  openWarnings: integer("open_warnings").notNull(),
  generatedAt: text("generated_at").notNull(),
});

export type Project = typeof projects.$inferSelect;
export type AirSystem = typeof airSystems.$inferSelect;
export type Outlet = typeof outlets.$inferSelect;
export type Instrument = typeof instruments.$inferSelect;
export type Finding = typeof findings.$inferSelect;
export type ReportVersion = typeof reportVersions.$inferSelect;
