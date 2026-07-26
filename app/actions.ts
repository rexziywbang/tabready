"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/src/db/client";
import {
  findings,
  instruments,
  projects,
  reportVersions,
} from "@/src/db/schema";
import { assembleReportSnapshot } from "@/src/report/assemble";
import { runChecks } from "@/src/rules/engine";

const projectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  clientName: z.string().trim().min(2).max(120),
  tolerancePct: z.coerce.number().min(0.1).max(50),
});

export async function createProject(formData: FormData): Promise<void> {
  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    clientName: formData.get("clientName"),
    tolerancePct: formData.get("tolerancePct"),
  });
  if (!parsed.success) {
    redirect("/?error=Enter+a+project+name,+client,+and+valid+tolerance.");
  }
  const id = crypto.randomUUID();
  await db.insert(projects).values({
    id,
    ...parsed.data,
    createdAt: new Date().toISOString(),
  });
  redirect(`/projects/${id}`);
}

const instrumentSchema = z.object({
  name: z.string().trim().min(2).max(100),
  type: z.string().trim().min(2).max(100),
  serial: z.string().trim().min(1).max(100),
  calibrationDate: z.string().date(),
  calibrationIntervalMonths: z.coerce.number().int().min(1).max(120),
});

export async function saveInstrument(formData: FormData): Promise<void> {
  const parsed = instrumentSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    serial: formData.get("serial"),
    calibrationDate: formData.get("calibrationDate"),
    calibrationIntervalMonths: formData.get("calibrationIntervalMonths"),
  });
  if (!parsed.success) {
    redirect("/instruments?error=Complete+all+instrument+fields.");
  }
  const id = String(formData.get("id") ?? "").trim();
  if (id) {
    await db
      .update(instruments)
      .set(parsed.data)
      .where(eq(instruments.id, id));
  } else {
    await db.insert(instruments).values({
      id: crypto.randomUUID(),
      ...parsed.data,
    });
  }
  revalidatePath("/instruments");
  redirect("/instruments?notice=Instrument+registry+updated.");
}

export async function acknowledgeFinding(formData: FormData): Promise<void> {
  const findingId = String(formData.get("findingId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const [finding] = await db
    .select()
    .from(findings)
    .where(eq(findings.id, findingId))
    .limit(1);
  if (finding?.severity === "warning") {
    await db
      .update(findings)
      .set({
        status: "acknowledged",
        resolutionNote: "Acknowledged by reviewer",
        resolvedAt: new Date().toISOString(),
      })
      .where(eq(findings.id, findingId));
  }
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}?tab=exceptions&finding=${findingId}`);
}

export async function resolveFinding(formData: FormData): Promise<void> {
  const findingId = String(formData.get("findingId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const resolvedBy = String(formData.get("resolvedBy") ?? "").trim();
  if (!note || !resolvedBy) {
    redirect(
      `/projects/${projectId}?tab=exceptions&finding=${findingId}&error=Resolution+note+and+reviewer+name+are+required.`,
    );
  }
  await db
    .update(findings)
    .set({
      status: "resolved",
      resolutionNote: note,
      resolvedBy,
      resolvedAt: new Date().toISOString(),
    })
    .where(eq(findings.id, findingId));
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}?tab=exceptions&finding=${findingId}`);
}

export async function rerunChecks(formData: FormData): Promise<void> {
  const projectId = String(formData.get("projectId") ?? "");
  await runChecks(projectId);
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}?tab=exceptions&notice=Readiness+checks+re-run.`);
}

export async function generateReport(formData: FormData): Promise<void> {
  const projectId = String(formData.get("projectId") ?? "");
  const existing = await db
    .select()
    .from(reportVersions)
    .where(eq(reportVersions.projectId, projectId))
    .orderBy(desc(reportVersions.versionNumber))
    .limit(1);
  const versionNumber = (existing[0]?.versionNumber ?? 0) + 1;
  const snapshot = await assembleReportSnapshot(projectId);
  const openErrors = snapshot.findings.filter(
    (finding) =>
      finding.status === "open" && finding.severity === "error",
  ).length;
  const openWarnings = snapshot.findings.filter(
    (finding) =>
      finding.status === "open" && finding.severity === "warning",
  ).length;
  const id = crypto.randomUUID();
  await db.insert(reportVersions).values({
    id,
    projectId,
    versionNumber,
    snapshotJson: JSON.stringify(snapshot),
    openErrors,
    openWarnings,
    generatedAt: snapshot.frozenAt,
  });
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}?tab=report&notice=Report+version+${versionNumber}+generated.`);
}
