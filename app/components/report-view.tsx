import { FileText, Printer } from "lucide-react";
import { generateReport } from "@/app/actions";
import type { Project, ReportVersion } from "@/src/db/schema";

export function ReportView({
  project,
  reports,
}: {
  project: Project;
  reports: ReportVersion[];
}) {
  return (
    <div>
      <div className="report-intro">
        <div>
          <p className="eyebrow">Immutable package history</p>
          <h2>Report versions</h2>
          <p>
            Each version freezes the data, instruments, findings, and reviewer
            dispositions at the moment it is generated.
          </p>
        </div>
        <form action={generateReport}>
          <input type="hidden" name="projectId" value={project.id} />
          <button className="button button-primary" type="submit">
            <FileText size={16} />
            Generate report version
          </button>
        </form>
      </div>
      {reports.length === 0 ? (
        <div className="empty-state compact">
          <h2>No report versions yet</h2>
          <p>Generate the first frozen review package when the project is ready.</p>
        </div>
      ) : (
        <div className="version-list">
          {reports.map((report) => (
            <article className="version-row" key={report.id}>
              <div className="version-mark">v{report.versionNumber}</div>
              <div className="version-copy">
                <h3>Report version {report.versionNumber}</h3>
                <p>
                  Generated{" "}
                  {new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(report.generatedAt))}
                </p>
              </div>
              <div className="version-counts">
                <span>
                  <b>{report.openErrors}</b> open errors
                </span>
                <span>
                  <b>{report.openWarnings}</b> open warnings
                </span>
              </div>
              <a
                className="button button-secondary"
                href={`/projects/${project.id}/report/${report.id}/print`}
                target="_blank"
              >
                <Printer size={15} />
                Open print view
              </a>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
