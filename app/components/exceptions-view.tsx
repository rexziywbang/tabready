import {
  acknowledgeFinding,
  rerunChecks,
  resolveFinding,
} from "@/app/actions";
import type { AirSystem, Finding, Outlet, Project } from "@/src/db/schema";
import { SeverityBadge, StatusBadge } from "./badges";

const RULE_LABELS: Record<string, string> = {
  missing_outlet_id: "Missing outlet ID",
  duplicate_outlet_id: "Duplicate outlet ID",
  missing_design_value: "Missing design value",
  missing_measured_value: "Missing measured value",
  invalid_value: "Invalid value",
  out_of_tolerance: "Outside tolerance",
  system_total_mismatch: "System total mismatch",
  missing_instrument: "Missing instrument",
  unknown_instrument: "Unknown instrument",
  expired_calibration: "Expired calibration",
  missing_test_date: "Missing test date",
  missing_technician: "Missing technician",
};

export function ExceptionsView({
  project,
  findings,
  systems,
  outlets,
  params,
}: {
  project: Project;
  findings: Finding[];
  systems: AirSystem[];
  outlets: Outlet[];
  params: Record<string, string | undefined>;
}) {
  const severity = params.severity ?? "all";
  const status = params.status ?? "open";
  const rule = params.rule ?? "all";
  const outletFilter = params.outlet;
  const filtered = findings.filter(
    (finding) =>
      (severity === "all" || finding.severity === severity) &&
      (status === "all" || finding.status === status) &&
      (rule === "all" || finding.ruleId === rule) &&
      (!outletFilter || finding.outletId === outletFilter),
  );
  const selected = findings.find((finding) => finding.id === params.finding);
  const rules = [...new Set(findings.map((finding) => finding.ruleId))].sort();

  return (
    <div className="exceptions-layout">
      <div className="exception-main">
        <div className="toolbar">
          <form className="filter-row" method="get">
            <input type="hidden" name="tab" value="exceptions" />
            <label>
              Severity
              <select name="severity" defaultValue={severity}>
                <option value="all">All</option>
                <option value="error">Errors</option>
                <option value="warning">Warnings</option>
              </select>
            </label>
            <label>
              Status
              <select name="status" defaultValue={status}>
                <option value="open">Open</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="resolved">Resolved</option>
                <option value="all">All</option>
              </select>
            </label>
            <label>
              Rule
              <select name="rule" defaultValue={rule}>
                <option value="all">All readiness checks</option>
                {rules.map((ruleId) => (
                  <option value={ruleId} key={ruleId}>
                    {RULE_LABELS[ruleId] ?? ruleId}
                  </option>
                ))}
              </select>
            </label>
            <button className="button button-secondary" type="submit">
              Apply filters
            </button>
          </form>
          <form action={rerunChecks}>
            <input type="hidden" name="projectId" value={project.id} />
            <button className="button button-secondary" type="submit">
              Re-run checks
            </button>
          </form>
        </div>

        {params.error && <div className="notice notice-error">{params.error}</div>}

        {filtered.length === 0 && status === "open" ? (
          <div className="empty-state compact">
            <h2>Readiness checks complete — no open findings.</h2>
            <p>Change the filters to review acknowledged or resolved findings.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state compact">
            <h2>No findings match these filters</h2>
            <p>Try a different severity, status, or readiness check.</p>
          </div>
        ) : (
          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Readiness check</th>
                  <th>Finding</th>
                  <th>Location</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((finding) => {
                  const outlet = outlets.find(
                    (candidate) => candidate.id === finding.outletId,
                  );
                  const system = systems.find(
                    (candidate) => candidate.id === finding.airSystemId,
                  );
                  const href = new URLSearchParams({
                    tab: "exceptions",
                    finding: finding.id,
                    severity,
                    status,
                    rule,
                  });
                  return (
                    <tr key={finding.id}>
                      <td>
                        <SeverityBadge severity={finding.severity} />
                      </td>
                      <td>{RULE_LABELS[finding.ruleId] ?? finding.ruleId}</td>
                      <td>
                        <a className="finding-link" href={`?${href.toString()}`}>
                          {finding.message}
                        </a>
                      </td>
                      <td>
                        {outlet ? (
                          <a href={`?tab=data#outlet-${outlet.id}`}>
                            {system?.unitId} / {outlet.outletId || "unnamed row"}
                          </a>
                        ) : (
                          system?.unitId || "Project"
                        )}
                      </td>
                      <td>
                        <StatusBadge status={finding.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <aside className="detail-drawer" aria-label="Finding details">
          <div className="drawer-heading">
            <div>
              <p className="eyebrow">Finding details</p>
              <h2>{RULE_LABELS[selected.ruleId] ?? selected.ruleId}</h2>
            </div>
            <a className="drawer-close" href={`?tab=exceptions`}>
              Close
            </a>
          </div>
          <div className="drawer-badges">
            <SeverityBadge severity={selected.severity} />
            <StatusBadge status={selected.status} />
            <span className="rule-version">rules v{selected.ruleVersion}</span>
          </div>
          <p className="drawer-message">{selected.message}</p>
          <section>
            <h3>Exact inputs evaluated</h3>
            <dl className="input-list">
              {Object.entries(JSON.parse(selected.inputsJson) as Record<string, unknown>).map(
                ([key, value]) => (
                  <div key={key}>
                    <dt>{key.replaceAll("_", " ")}</dt>
                    <dd>{value === null || value === "" ? "Not recorded" : String(value)}</dd>
                  </div>
                ),
              )}
            </dl>
          </section>
          {selected.outletId && (
            <a className="location-link" href={`?tab=data#outlet-${selected.outletId}`}>
              View affected row in Data
            </a>
          )}
          {selected.status === "open" && (
            <div className="drawer-actions">
              {selected.severity === "warning" && (
                <form action={acknowledgeFinding}>
                  <input type="hidden" name="findingId" value={selected.id} />
                  <input type="hidden" name="projectId" value={project.id} />
                  <button className="button button-secondary full" type="submit">
                    Acknowledge warning
                  </button>
                </form>
              )}
              <form action={resolveFinding} className="resolve-form">
                <h3>Resolve finding</h3>
                <input type="hidden" name="findingId" value={selected.id} />
                <input type="hidden" name="projectId" value={project.id} />
                <label>
                  Resolution note
                  <textarea name="note" rows={3} required placeholder="Describe what was reviewed or corrected" />
                </label>
                <label>
                  Reviewer name
                  <input name="resolvedBy" required placeholder="Type full name" />
                </label>
                <button className="button button-primary full" type="submit">
                  Resolve finding
                </button>
              </form>
            </div>
          )}
          {selected.status !== "open" && (
            <section className="resolution-card">
              <h3>Reviewer disposition</h3>
              <p>{selected.resolutionNote || "Acknowledged by reviewer"}</p>
              {selected.resolvedBy && <small>Recorded by {selected.resolvedBy}</small>}
            </section>
          )}
        </aside>
      )}
    </div>
  );
}
