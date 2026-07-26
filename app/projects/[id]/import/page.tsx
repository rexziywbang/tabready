import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getLatestMapping, getProjectWorkspace } from "@/src/db/queries";
import type { ColumnMapping } from "@/src/import/suggest";
import { ImportWizard } from "./import-wizard";

export const dynamic = "force-dynamic";

export default async function ImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [workspace, mappingJson] = await Promise.all([
    getProjectWorkspace(id),
    getLatestMapping(id),
  ]);
  if (!workspace.project) notFound();
  let previousMapping: ColumnMapping | null = null;
  if (mappingJson) {
    try {
      previousMapping = JSON.parse(mappingJson) as ColumnMapping;
    } catch {
      previousMapping = null;
    }
  }
  return (
    <div className="page-wrap import-page">
      <a className="back-link" href={`/projects/${id}`}>
        <ArrowLeft size={15} />
        Back to project
      </a>
      <section className="page-heading import-heading">
        <div>
          <p className="eyebrow">Guided Excel import</p>
          <h1>{workspace.project.name}</h1>
          <p>
            Map the workbook to TABReady&apos;s airside outlet fields before
            committing any rows.
          </p>
        </div>
        {id === "riverside-medical-demo" && (
          <span className="demo-chip prominent">Fictional demo data</span>
        )}
      </section>
      <ImportWizard
        projectId={id}
        projectName={workspace.project.name}
        previousMapping={previousMapping}
      />
    </div>
  );
}
