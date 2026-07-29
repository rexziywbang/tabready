import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { db } from "@/src/db/client";
import { reportVersions } from "@/src/db/schema";
import type { ReportSnapshot } from "@/src/report/assemble";
import { numericValue, RULES_VERSION } from "@/src/rules/types";

export const dynamic = "force-dynamic";

const DISCLAIMER =
  "Readiness checks complete. This document does not constitute certification. A qualified certified professional is responsible for all measurements, conclusions, and approval.";

function numeric(value: string | null): number | null {
  return numericValue(value);
}

function paginateFindings(
  findings: ReportSnapshot["findings"],
): ReportSnapshot["findings"][] {
  const pages: ReportSnapshot["findings"][] = [];
  let page: ReportSnapshot["findings"] = [];
  let pageWeight = 0;

  for (const finding of findings) {
    const findingWeight = finding.status === "open" ? 1 : 1.5;
    if (page.length > 0 && pageWeight + findingWeight > 10) {
      pages.push(page);
      page = [];
      pageWeight = 0;
    }
    page.push(finding);
    pageWeight += findingWeight;
  }

  if (page.length > 0) pages.push(page);
  return pages.length > 0 ? pages : [[]];
}

function PrintFooter() {
  return (
    <footer className="print-footer">
      <em>{DISCLAIMER}</em>
      <span className="page-number">Page </span>
    </footer>
  );
}

export default async function PrintReport({
  params,
}: {
  params: Promise<{ id: string; versionId: string }>;
}) {
  const { id, versionId } = await params;
  const [report] = await db
    .select()
    .from(reportVersions)
    .where(
      and(
        eq(reportVersions.id, versionId),
        eq(reportVersions.projectId, id),
      ),
    )
    .limit(1);
  if (!report) notFound();
  const snapshot = JSON.parse(report.snapshotJson) as ReportSnapshot;
  const rulesVersion =
    [...new Set(snapshot.findings.map((finding) => finding.ruleVersion))].join(
      ", ",
    ) || RULES_VERSION;
  const allOutlets = snapshot.systems.flatMap((system) => system.outlets);
  const measurable = allOutlets.filter(
    (outlet) =>
      numeric(outlet.designCfm) !== null &&
      numeric(outlet.designCfm)! > 0 &&
      numeric(outlet.finalCfm) !== null,
  );
  const within = measurable.filter((outlet) => {
    const design = numeric(outlet.designCfm)!;
    const final = numeric(outlet.finalCfm)!;
    return (
      Math.abs((final / design) * 100 - 100) <=
      snapshot.project.tolerancePct + 1e-9
    );
  });
  const byRule = new Map<string, typeof snapshot.findings>();
  for (const finding of snapshot.findings) {
    byRule.set(finding.ruleId, [
      ...(byRule.get(finding.ruleId) ?? []),
      finding,
    ]);
  }
  const findingPages = paginateFindings(snapshot.findings);

  return (
    <div className="print-view">
      <div className="print-toolbar">
        <div>
          <b>TABReady report v{report.versionNumber}</b>
          <span>Frozen {new Date(report.generatedAt).toLocaleString()}</span>
        </div>
        <button className="button button-primary" onClick={undefined}>
          <Printer size={16} />
          Print / Save as PDF
        </button>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "document.currentScript.previousElementSibling.addEventListener('click',()=>window.print())",
          }}
        />
      </div>

      <article className="report-document">
        <section className="print-page cover-page">
          <div className="cover-brand">
            <span className="cover-mark">TR</span>
            <div>
              <b>TABReady</b>
              <small>Report readiness package</small>
            </div>
          </div>
          <div className="cover-content">
            <p className="cover-overline">Airside outlet test data</p>
            <h1>{snapshot.project.name}</h1>
            <p className="cover-client">{snapshot.project.clientName}</p>
            <div className="cover-rule" />
            <dl className="cover-meta">
              <div>
                <dt>Report version</dt>
                <dd>{report.versionNumber}</dd>
              </div>
              <div>
                <dt>Generated</dt>
                <dd>
                  {new Intl.DateTimeFormat("en-US", {
                    dateStyle: "long",
                  }).format(new Date(report.generatedAt))}
                </dd>
              </div>
              <div>
                <dt>Readiness rule set</dt>
                <dd>{rulesVersion}</dd>
              </div>
              <div>
                <dt>Project tolerance</dt>
                <dd>±{snapshot.project.tolerancePct}%</dd>
              </div>
            </dl>
          </div>
          <div className="cover-status">
            <div>
              <span>Open errors</span>
              <b>{report.openErrors}</b>
            </div>
            <div>
              <span>Open warnings</span>
              <b>{report.openWarnings}</b>
            </div>
          </div>
          <p className="prepared-line">
            Prepared with TABReady — Your Firm Name Here
          </p>
          <PrintFooter />
        </section>

        <section className="print-page summary-page">
          <div className="report-section-heading">
            <span>01</span>
            <div>
              <p>Project overview</p>
              <h2>Readiness summary</h2>
            </div>
          </div>
          <div className="report-kpis">
            <div>
              <span>Outlets tested</span>
              <b>{allOutlets.length}</b>
            </div>
            <div>
              <span>Within tolerance</span>
              <b>
                {measurable.length === 0
                  ? "n/a"
                  : `${((within.length / measurable.length) * 100).toFixed(1)}%`}
              </b>
            </div>
            <div>
              <span>Air systems</span>
              <b>{snapshot.systems.length}</b>
            </div>
            <div>
              <span>Total findings</span>
              <b>{snapshot.findings.length}</b>
            </div>
          </div>
          <h3 className="report-subheading">Findings by readiness check</h3>
          <table className="report-table">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Total</th>
                <th>Open</th>
                <th>Reviewed</th>
              </tr>
            </thead>
            <tbody>
              {[...byRule.entries()]
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([ruleId, ruleFindings]) => (
                  <tr key={ruleId}>
                    <td>{ruleId.replaceAll("_", " ")}</td>
                    <td>{ruleFindings.length}</td>
                    <td>
                      {
                        ruleFindings.filter(
                          (finding) => finding.status === "open",
                        ).length
                      }
                    </td>
                    <td>
                      {
                        ruleFindings.filter(
                          (finding) => finding.status !== "open",
                        ).length
                      }
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <h3 className="report-subheading">Instrument registry at generation</h3>
          <table className="report-table">
            <thead>
              <tr>
                <th>Instrument</th>
                <th>Type</th>
                <th>Serial</th>
                <th>Calibration date</th>
                <th>Interval</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.instruments.map((instrument) => (
                <tr key={instrument.id}>
                  <td>{instrument.name}</td>
                  <td>{instrument.type}</td>
                  <td>{instrument.serial}</td>
                  <td>{instrument.calibrationDate}</td>
                  <td>{instrument.calibrationIntervalMonths} months</td>
                </tr>
              ))}
            </tbody>
          </table>
          <PrintFooter />
        </section>

        {snapshot.systems.map((system, systemIndex) => (
          <section className="print-page system-report-page" key={system.id}>
            <div className="report-section-heading">
              <span>{String(systemIndex + 2).padStart(2, "0")}</span>
              <div>
                <p>Air outlet test sheet</p>
                <h2>{system.unitId}</h2>
              </div>
              <dl className="system-report-meta">
                <div>
                  <dt>Design total</dt>
                  <dd>{system.designTotalCfm?.toLocaleString() ?? "—"} CFM</dd>
                </div>
                <div>
                  <dt>Outlet count</dt>
                  <dd>{system.outlets.length}</dd>
                </div>
              </dl>
            </div>
            <table className="report-table outlet-report-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Area / type</th>
                  <th>Size</th>
                  <th>Design</th>
                  <th>Final</th>
                  <th>% design</th>
                  <th>Instrument</th>
                  <th>Technician / date</th>
                </tr>
              </thead>
              <tbody>
                {system.outlets.map((outlet) => {
                  const design = numeric(outlet.designCfm);
                  const final = numeric(outlet.finalCfm);
                  const pct =
                    design && final !== null ? (final / design) * 100 : null;
                  return (
                    <tr key={outlet.id}>
                      <td>{outlet.outletId || "—"}</td>
                      <td>
                        {outlet.areaServed || "—"}
                        <small>{outlet.outletType || "—"}</small>
                      </td>
                      <td>{outlet.size || "—"}</td>
                      <td>{outlet.designCfm || "—"}</td>
                      <td>{outlet.finalCfm || "—"}</td>
                      <td>{pct === null ? "n/a" : `${pct.toFixed(1)}%`}</td>
                      <td>{outlet.instrumentName || "—"}</td>
                      <td>
                        {outlet.technician || "—"}
                        <small>{outlet.testDate || "No date"}</small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <PrintFooter />
          </section>
        ))}

        {findingPages.map((pageFindings, pageIndex) => {
          const findingsBeforePage = findingPages
            .slice(0, pageIndex)
            .reduce((total, page) => total + page.length, 0);
          return (
            <section
              className="print-page findings-appendix"
              key={`appendix-${pageIndex}`}
            >
              <div className="report-section-heading">
                <span>{pageIndex === 0 ? "A" : `A.${pageIndex + 1}`}</span>
                <div>
                  <p>
                    {pageIndex === 0
                      ? "Reviewer record"
                      : "Reviewer record continued"}
                  </p>
                  <h2>
                    Findings appendix{pageIndex === 0 ? "" : " (continued)"}
                  </h2>
                </div>
              </div>
              <div className="appendix-list">
                {pageFindings.length === 0 ? (
                  <p>No findings were recorded in this version.</p>
                ) : (
                  pageFindings.map((finding, index) => (
                    <article key={finding.id}>
                      <div className="appendix-number">
                        {String(findingsBeforePage + index + 1).padStart(2, "0")}
                      </div>
                      <div>
                        <div className="appendix-heading">
                          <b>{finding.ruleId.replaceAll("_", " ")}</b>
                          <span
                            className={`report-severity ${finding.severity}`}
                          >
                            {finding.severity}
                          </span>
                          <span className="appendix-status">
                            {finding.status}
                          </span>
                        </div>
                        <p>{finding.message}</p>
                        <small>Rule version {finding.ruleVersion}</small>
                        {finding.status !== "open" && (
                          <div className="appendix-resolution">
                            <b>Reviewer disposition</b>
                            <p>
                              {finding.resolutionNote ||
                                "Acknowledged by reviewer"}
                            </p>
                            {finding.resolvedBy && (
                              <span>Recorded by {finding.resolvedBy}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </div>
              <PrintFooter />
            </section>
          );
        })}
      </article>
    </div>
  );
}
