import { db, ensureDatabase } from "./client";
import { instruments, projects } from "./schema";

export async function seed(): Promise<void> {
  ensureDatabase();
  const now = new Date().toISOString();
  await db.insert(instruments).values([
    {
      id: crypto.randomUUID(),
      name: "Flow Hood FH-1",
      type: "Electronic flow hood",
      serial: "FH1-DEMO-2601",
      calibrationDate: "2026-01-15",
      calibrationIntervalMonths: 12,
    },
    {
      id: crypto.randomUUID(),
      name: "Flow Hood FH-2",
      type: "Electronic flow hood",
      serial: "FH2-DEMO-2505",
      calibrationDate: "2025-05-01",
      calibrationIntervalMonths: 12,
    },
    {
      id: crypto.randomUUID(),
      name: "Anemometer AN-1",
      type: "Rotating vane anemometer",
      serial: "AN1-DEMO-2512",
      calibrationDate: "2025-12-20",
      calibrationIntervalMonths: 12,
    },
  ]);
  await db.insert(projects).values({
    id: "riverside-medical-demo",
    name: "Riverside Medical Office Building",
    clientName: "Fictional demonstration client",
    tolerancePct: 10,
    createdAt: now,
  });
  console.log("Seeded the fictional Riverside Medical demo project and instruments.");
}

await seed();
