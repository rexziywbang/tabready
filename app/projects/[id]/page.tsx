import { notFound } from "next/navigation";
import {
  AlertTriangle,
  Database,
  FileText,
  Upload,
} from "lucide-react";
import { CountBadge } from "@/app/components/badges";
import { ExceptionsView } from "@/app/components/exceptions-view";
import { ProjectData } from "@/app/components/project-data";
import { ReportView } from "@/app/components/report-view";
import { getProjectWorkspace } from "@/src/db/queries";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const workspace = await getProjectWorkspace(id);
  if (!workspace.project) notFound();
  const tab = query.tab ?? (query.finding ? "exceptions" : "data");
  const openErrors = workspace.findings.filter(
    (finding) =>
      finding.status === "open" && finding.severity === "error",
  ).length;
  const openWarnings = workspace.findings.filter(
    (finding) =>
      finding.status === "open" && finding.severity === "warning",
  ).length;
  const openTotal = openErrors + openWarnings;

  return (
    <div className="page-wrap project-page">
      <section className="project-header">
        <div>
          <div className="project-kicker">
            <span>Airside outlet review</span>
            {id === "riverside-medical-demo" && (
              <span className="demo-chip">Fictional demo project</span>
            )}
          </div>
          <h1>{workspace.project.name}</h1>
          <p>{workspace.project.clientName}</p>
        </div>
        <div className="project-health">
          <div>
            <span>Systems</span>
            <b>{workspace.systems.length}</b>
          </div>
          <div>
            <span>Outlets</span>
            <b>{workspace.outlets.length}</b>
          </div>
          <div>
            <span>Tolerance</span>
            <b>±{workspace.project.tolerancePct}%</b>
          </div>
          <div className="health-findings">
            <span>Open findings</span>
            <p>
              <CountBadge value={openErrors} tone="error" />
              <CountBadge value={openWarnings} tone="warning" />
            </p>
          </div>
        </div>
      </section>

      {query.notice && <div className="notice notice-success">{query.notice}</div>}

      <nav className="project-tabs" aria-label="Project sections">
        <a className={tab === "data" ? "active" : ""} href="?tab=data">
          <Database size={16} />
          Data
          <span>{workspace.outlets.length}</span>
        </a>
        <a
          className={tab === "exceptions" ? "active" : ""}
          href="?tab=exceptions"
        >
          <AlertTriangle size={16} />
          Exceptions
          <span className={openTotal > 0 ? "attention" : ""}>{openTotal}</span>
        </a>
        <a className={tab === "report" ? "active" : ""} href="?tab=report">
          <FileText size={16} />
          Report
          <span>{workspace.reports.length}</span>
        </a>
        <a className="import-tab" href={`/projects/${id}/import`}>
          <Upload size={16} />
          Import data
        </a>
      </nav>

      <section className="tab-panel">
        {tab === "data" && (
          <ProjectData
            project={workspace.project}
            systems={workspace.systems}
            joinedOutlets={workspace.outlets}
            findings={workspace.findings}
          />
        )}
        {tab === "exceptions" && (
          <ExceptionsView
            project={workspace.project}
            findings={workspace.findings}
            systems={workspace.systems}
            outlets={workspace.outlets.map((row) => row.outlet)}
            params={query}
          />
        )}
        {tab === "report" && (
          <ReportView project={workspace.project} reports={workspace.reports} />
        )}
      </section>
    </div>
  );
}
