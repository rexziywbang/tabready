import { AlertCircle, CheckCircle2, MinusCircle } from "lucide-react";
import type {
  AirSystem,
  Finding,
  Outlet,
  Project,
} from "@/src/db/schema";

function numberValue(value: string | null): number | null {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function percent(
  designValue: string | null,
  finalValue: string | null,
): number | null {
  const design = numberValue(designValue);
  const final = numberValue(finalValue);
  if (design === null || design <= 0 || final === null) return null;
  return (final / design) * 100;
}

export function ProjectData({
  project,
  systems,
  joinedOutlets,
  findings,
}: {
  project: Project;
  systems: AirSystem[];
  joinedOutlets: Array<{ outlet: Outlet; system: AirSystem }>;
  findings: Finding[];
}) {
  if (joinedOutlets.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <MinusCircle size={22} />
        </div>
        <h2>No outlet data imported yet</h2>
        <p>Start the guided Excel import to map and review this project&apos;s readings.</p>
        <a className="button button-primary" href={`/projects/${project.id}/import`}>
          Import Excel workbook
        </a>
      </div>
    );
  }

  return (
    <div className="system-stack">
      {systems.map((system) => {
        const systemOutlets = joinedOutlets
          .filter((row) => row.system.id === system.id)
          .map((row) => row.outlet);
        return (
          <details className="system-section" key={system.id} open>
            <summary>
              <span>
                <strong>{system.unitId}</strong>
                <small>{system.description}</small>
              </span>
              <span className="summary-metrics">
                <b>{systemOutlets.length}</b> outlets
                <b>{system.designTotalCfm?.toLocaleString() ?? "—"}</b> design CFM
              </span>
            </summary>
            <div className="table-scroll">
              <table className="data-table dense">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Area</th>
                    <th>Type / size</th>
                    <th className="number">Design</th>
                    <th className="number">Final</th>
                    <th className="number">% design</th>
                    <th>Instrument</th>
                    <th>Technician</th>
                    <th>Date</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {systemOutlets.map((outlet) => {
                    const value = percent(outlet.designCfm, outlet.finalCfm);
                    const within =
                      value !== null &&
                      Math.abs(value - 100) <= project.tolerancePct + 1e-9;
                    const outletFindings = findings.filter(
                      (finding) =>
                        finding.outletId === outlet.id &&
                        finding.status === "open",
                    );
                    return (
                      <tr id={`outlet-${outlet.id}`} key={outlet.id}>
                        <td className="strong">{outlet.outletId || "—"}</td>
                        <td>{outlet.areaServed || "—"}</td>
                        <td>
                          {outlet.outletType || "—"}
                          <small className="table-sub">{outlet.size || "—"}</small>
                        </td>
                        <td className="number tabular">{outlet.designCfm || "—"}</td>
                        <td className="number tabular">{outlet.finalCfm || "—"}</td>
                        <td className="number">
                          <span
                            className={`percent-cell ${
                              value === null ? "na" : within ? "within" : "outside"
                            }`}
                          >
                            {value === null ? (
                              <MinusCircle size={13} />
                            ) : within ? (
                              <CheckCircle2 size={13} />
                            ) : (
                              <AlertCircle size={13} />
                            )}
                            {value === null ? "n/a" : `${value.toFixed(1)}%`}
                          </span>
                        </td>
                        <td>{outlet.instrumentName || "—"}</td>
                        <td>{outlet.technician || "—"}</td>
                        <td className="tabular">{outlet.testDate || "—"}</td>
                        <td>
                          {outletFindings.length > 0 ? (
                            <a
                              className="inline-findings"
                              href={`/projects/${project.id}?tab=exceptions&outlet=${outlet.id}`}
                            >
                              {outletFindings.length} flag
                              {outletFindings.length === 1 ? "" : "s"}
                            </a>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}
    </div>
  );
}
