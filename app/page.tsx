import Link from "next/link";
import { ArrowRight, Building2, Plus, Wind } from "lucide-react";
import { createProject } from "./actions";
import { CountBadge } from "./components/badges";
import { getProjectsWithCounts } from "@/src/db/queries";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [projectRows, params] = await Promise.all([
    getProjectsWithCounts(),
    searchParams,
  ]);
  const totalOutlets = projectRows.reduce(
    (sum, project) => sum + project.outletCount,
    0,
  );
  const openFindings = projectRows.reduce(
    (sum, project) => sum + project.openErrors + project.openWarnings,
    0,
  );

  return (
    <div className="page-wrap">
      <section className="page-heading dashboard-heading">
        <div>
          <p className="eyebrow">Project control</p>
          <h1>Report readiness, without the spreadsheet chase.</h1>
          <p>
            Import measured airside data, run deterministic checks, and prepare
            a versioned package for qualified professional review.
          </p>
        </div>
        <div className="summary-strip">
          <div>
            <span>Active projects</span>
            <b>{projectRows.length}</b>
          </div>
          <div>
            <span>Outlet readings</span>
            <b>{totalOutlets.toLocaleString()}</b>
          </div>
          <div>
            <span>Open findings</span>
            <b>{openFindings}</b>
          </div>
        </div>
      </section>

      {params.error && <div className="notice notice-error">{params.error}</div>}

      <div className="dashboard-grid">
        <section>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Workspace</p>
              <h2>Projects</h2>
            </div>
            <span className="section-meta">
              {projectRows.length} project{projectRows.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="project-list">
            {projectRows.map((project) => (
              <Link
                className="project-card"
                href={`/projects/${project.id}`}
                key={project.id}
              >
                <div className="project-icon">
                  <Building2 size={21} />
                </div>
                <div className="project-main">
                  <div className="project-title-row">
                    <h3>{project.name}</h3>
                    {project.id === "riverside-medical-demo" && (
                      <span className="demo-chip">Fictional demo</span>
                    )}
                  </div>
                  <p>{project.clientName}</p>
                  <div className="project-stats">
                    <span>
                      <b>{project.systemCount}</b> systems
                    </span>
                    <span>
                      <b>{project.outletCount}</b> outlets
                    </span>
                    <span>
                      <b>±{project.tolerancePct}%</b> tolerance
                    </span>
                  </div>
                </div>
                <div className="project-findings">
                  <span>
                    <CountBadge value={project.openErrors} tone="error" />
                    errors
                  </span>
                  <span>
                    <CountBadge value={project.openWarnings} tone="warning" />
                    warnings
                  </span>
                </div>
                <ArrowRight className="project-arrow" size={18} />
              </Link>
            ))}
          </div>
        </section>

        <aside className="create-panel">
          <div className="create-icon">
            <Plus size={19} />
          </div>
          <p className="eyebrow">New workspace</p>
          <h2>Create a project</h2>
          <p>
            Set the review tolerance now; it can be checked against every imported
            outlet.
          </p>
          <form action={createProject} className="stack-form">
            <label>
              Project name
              <input name="name" required placeholder="e.g. North Campus Clinic" />
            </label>
            <label>
              Client
              <input name="clientName" required placeholder="Client or facility" />
            </label>
            <label>
              Tolerance
              <span className="input-suffix">
                <input
                  name="tolerancePct"
                  type="number"
                  min="0.1"
                  max="50"
                  step="0.1"
                  defaultValue="10"
                  required
                />
                <span>%</span>
              </span>
            </label>
            <button className="button button-primary full" type="submit">
              Create project
            </button>
          </form>
          <div className="positioning-note">
            <Wind size={16} />
            <p>
              TABReady flags report-readiness issues. Final responsibility remains
              with a qualified professional.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
