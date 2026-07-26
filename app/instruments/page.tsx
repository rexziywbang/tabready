import { CalendarClock, Plus, Settings2, Wrench } from "lucide-react";
import { saveInstrument } from "@/app/actions";
import { getInstruments } from "@/src/db/queries";

export const dynamic = "force-dynamic";

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function instrumentStatus(
  date: string,
  interval: number,
): { label: string; className: string; expiration: string } {
  const expirationDate = addMonths(new Date(`${date}T00:00:00Z`), interval);
  const remaining = expirationDate.getTime() - Date.now();
  const days = remaining / 86_400_000;
  return {
    expiration: expirationDate.toISOString().slice(0, 10),
    ...(days < 0
      ? { label: "Expired", className: "status-expired" }
      : days <= 30
        ? { label: "Expires within 30 days", className: "status-soon" }
        : { label: "Current", className: "status-current" }),
  };
}

export default async function InstrumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [registry, params] = await Promise.all([getInstruments(), searchParams]);
  return (
    <div className="page-wrap">
      <section className="page-heading split-heading">
        <div>
          <p className="eyebrow">Global registry</p>
          <h1>Test instruments</h1>
          <p>
            Calibration currency is evaluated against each outlet&apos;s test date.
            These seeded records are synthetic and intended only for demonstration.
          </p>
        </div>
        <div className="heading-stat">
          <Wrench size={20} />
          <span>
            <b>{registry.length}</b>
            registered instruments
          </span>
        </div>
      </section>

      {params.notice && <div className="notice notice-success">{params.notice}</div>}
      {params.error && <div className="notice notice-error">{params.error}</div>}

      <div className="instrument-layout">
        <section className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Instrument</th>
                <th>Type / serial</th>
                <th>Last calibration</th>
                <th>Interval</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {registry.map((instrument) => {
                const status = instrumentStatus(
                  instrument.calibrationDate,
                  instrument.calibrationIntervalMonths,
                );
                return (
                  <tr key={instrument.id}>
                    <td className="strong">{instrument.name}</td>
                    <td>
                      {instrument.type}
                      <small className="table-sub">{instrument.serial}</small>
                    </td>
                    <td className="tabular">{instrument.calibrationDate}</td>
                    <td>{instrument.calibrationIntervalMonths} months</td>
                    <td>
                      <span className={`instrument-status ${status.className}`}>
                        {status.label}
                      </span>
                      <small className="table-sub">Expires {status.expiration}</small>
                    </td>
                    <td>
                      <details className="edit-popover">
                        <summary aria-label={`Edit ${instrument.name}`}>
                          <Settings2 size={16} />
                          Edit
                        </summary>
                        <form action={saveInstrument} className="popover-form">
                          <input type="hidden" name="id" value={instrument.id} />
                          <label>
                            Name
                            <input name="name" defaultValue={instrument.name} required />
                          </label>
                          <label>
                            Type
                            <input name="type" defaultValue={instrument.type} required />
                          </label>
                          <label>
                            Serial
                            <input name="serial" defaultValue={instrument.serial} required />
                          </label>
                          <label>
                            Calibration date
                            <input
                              name="calibrationDate"
                              type="date"
                              defaultValue={instrument.calibrationDate}
                              required
                            />
                          </label>
                          <label>
                            Interval (months)
                            <input
                              name="calibrationIntervalMonths"
                              type="number"
                              min="1"
                              defaultValue={instrument.calibrationIntervalMonths}
                              required
                            />
                          </label>
                          <button className="button button-primary full" type="submit">
                            Save changes
                          </button>
                        </form>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <aside className="create-panel instrument-create">
          <div className="create-icon">
            <Plus size={19} />
          </div>
          <p className="eyebrow">Registry entry</p>
          <h2>Add instrument</h2>
          <form action={saveInstrument} className="stack-form">
            <label>
              Name
              <input name="name" required placeholder="Flow Hood FH-4" />
            </label>
            <label>
              Type
              <input name="type" required placeholder="Electronic flow hood" />
            </label>
            <label>
              Serial
              <input name="serial" required placeholder="Serial number" />
            </label>
            <label>
              Calibration date
              <input name="calibrationDate" type="date" required />
            </label>
            <label>
              Interval (months)
              <span className="input-with-icon">
                <CalendarClock size={16} />
                <input
                  name="calibrationIntervalMonths"
                  type="number"
                  min="1"
                  defaultValue="12"
                  required
                />
              </span>
            </label>
            <button className="button button-primary full" type="submit">
              Add to registry
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
