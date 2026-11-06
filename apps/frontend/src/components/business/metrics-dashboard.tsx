'use client';
import { useState, type FormEvent } from 'react';
import type { Metrics } from '@/lib/metrics';
import { useResource } from './use-resource';
import { Feedback } from './shared';

const number = (value: number) =>
  new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(value);
const dayLabel = (date: string) =>
  new Date(date).toLocaleDateString('es-AR', { timeZone: 'UTC' });
function preset(days: number) {
  const now = new Date();
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return {
    from: new Date(to.getTime() - days * 86400000).toISOString(),
    to: to.toISOString(),
  };
}
export function MetricsDashboard() {
  const [range, setRange] = useState<{ from: string; to: string }>();
  const [selection, setSelection] = useState('30');
  const [error, setError] = useState('');
  const [view, setView] = useState<'rooms' | 'buildings' | 'clients'>('rooms');
  const report = useResource<Metrics>(
    `/admin/metrics${range ? '?' + new URLSearchParams(range) : ''}`,
  );
  const data = report.data;
  function custom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const from = new Date(`${form.get('from')}T00:00:00Z`);
    const last = new Date(`${form.get('to')}T00:00:00Z`);
    const to = new Date(last.getTime() + 86400000);
    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime()) ||
      to <= from ||
      to.getTime() - from.getTime() > 366 * 86400000
    ) {
      setError('Elegí un período válido de hasta 366 días.');
      return;
    }
    setError('');
    setSelection('custom');
    setRange({ from: from.toISOString(), to: to.toISOString() });
  }
  const quietDays =
    data?.days
      .filter((day) => day.capacityHours > 0)
      .toSorted(
        (a, b) =>
          a.occupancyPercent - b.occupancyPercent ||
          a.date.localeCompare(b.date),
      )
      .slice(0, 7) ?? [];
  return (
    <>
      <div className="list-toolbar">
        <div className="compact-field">
          <label htmlFor="metrics-period">Período</label>
          <select
            id="metrics-period"
            value={selection}
            onChange={(event) => {
              const value = event.target.value;
              setSelection(value);
              setRange(preset(Number(value)));
              setError('');
            }}
          >
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
            <option value="365">Últimos 365 días</option>
            {selection === 'custom' && (
              <option value="custom">Personalizado</option>
            )}
          </select>
        </div>
        <button
          className="secondary"
          disabled={report.loading}
          onClick={report.reload}
        >
          Actualizar métricas
        </button>
      </div>
      <details className="filter-disclosure">
        <summary>Elegir otras fechas</summary>
        <form onSubmit={custom} aria-label="Período de métricas">
          <div className="form-grid">
            <label>
              Desde
              <input type="date" name="from" required />
            </label>
            <label>
              Hasta inclusive
              <input type="date" name="to" required />
            </label>
          </div>
          <button type="submit">Ver período</button>
        </form>
      </details>
      <Feedback error={error || report.error} />
      {report.loading && <p role="status">Calculando utilización…</p>}
      {data && (
        <>
          <p className="muted">
            {dayLabel(data.period.from)} —{' '}
            {dayLabel(
              new Date(new Date(data.period.to).getTime() - 1).toISOString(),
            )}{' '}
            · Horarios en UTC · Tiempo reservado, sin medición de asistencia.
          </p>
          <div className="metric-grid" aria-label="Resumen de utilización">
            {[
              ['Horas reservadas', number(data.summary.bookedHours) + ' h'],
              ['Reservas sin cancelar', number(data.summary.reservations)],
              [
                'Ocupación teórica',
                number(data.summary.occupancyPercent) + ' %',
              ],
              ['Empresas con reservas', number(data.summary.clients)],
              ['Cancelaciones', number(data.summary.cancellations)],
              [
                'Tasa de cancelación',
                number(data.summary.cancellationRate) + ' %',
              ],
            ].map(([label, value]) => (
              <section
                className="card metric-card"
                key={label}
                aria-label={label}
              >
                <h2>{label}</h2>
                <strong>{value}</strong>
              </section>
            ))}
          </div>
          <p className="muted hint">
            Ocupación teórica: horas reservadas /{' '}
            {number(data.summary.capacityHours)} horas de capacidad. Base de 24
            h por sala desde su alta, incluidas salas hoy inactivas. No
            representa horarios comerciales de apertura. Las cancelaciones se
            cuentan por el período de la reserva.
          </p>
          <section className="card metrics-ranking">
            <div className="section-heading">
              <h2>
                Utilización por{' '}
                {view === 'rooms'
                  ? 'sala'
                  : view === 'buildings'
                    ? 'edificio'
                    : 'empresa'}
              </h2>
              <div className="actions" aria-label="Agrupar utilización">
                {(['rooms', 'buildings', 'clients'] as const).map((key) => (
                  <button
                    className={key === view ? '' : 'secondary'}
                    aria-pressed={key === view}
                    key={key}
                    onClick={() => setView(key)}
                  >
                    {key === 'rooms'
                      ? 'Salas'
                      : key === 'buildings'
                        ? 'Edificios'
                        : 'Empresas'}
                  </button>
                ))}
              </div>
            </div>
            <p className="muted hint">
              Hasta {data.rankingLimit} resultados, ordenados por horas
              reservadas. Los totales incluyen todos los registros.
            </p>
            <div className="table-scroll">
              <table aria-label="Utilización">
                <thead>
                  <tr>
                    <th>
                      {view === 'rooms'
                        ? 'Sala'
                        : view === 'buildings'
                          ? 'Edificio'
                          : 'Empresa'}
                    </th>
                    <th>Horas</th>
                    <th>Reservas</th>
                    <th>Cancelaciones</th>
                    <th>
                      {view === 'clients'
                        ? 'Seguimiento comercial'
                        : 'Ocupación teórica'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {view === 'clients'
                    ? data.clients.map((client) => (
                        <tr key={client.id}>
                          <td>
                            {client.name}
                            <small className="metric-detail">
                              Última reserva:{' '}
                              {client.lastReservation
                                ? dayLabel(client.lastReservation)
                                : 'Sin reservas'}
                            </small>
                          </td>
                          <td>{number(client.bookedHours)} h</td>
                          <td>{client.reservations}</td>
                          <td>
                            {client.cancellations} (
                            {number(client.cancellationRate)} %)
                          </td>
                          <td>
                            {client.reservations >= 3
                              ? 'Cliente frecuente: evaluar incentivo'
                              : client.reservations === 0
                                ? client.lastReservation
                                  ? 'Sin uso en el período: evaluar reactivación'
                                  : 'Sin reservas: evaluar bienvenida'
                                : 'Evaluar seguimiento'}
                          </td>
                        </tr>
                      ))
                    : data[view].map((row) => (
                        <tr key={row.id ?? 'unassigned'}>
                          <td>
                            {row.name}
                            {'buildingName' in row && (
                              <small className="metric-detail">
                                {row.buildingName ?? 'Sin edificio asignado'}
                              </small>
                            )}
                          </td>
                          <td>{number(row.bookedHours)} h</td>
                          <td>{row.reservations}</td>
                          <td>{row.cancellations}</td>
                          <td>
                            <meter
                              min={0}
                              max={100}
                              value={row.occupancyPercent}
                              aria-label={`Ocupación de ${row.name}`}
                            />{' '}
                            {number(row.occupancyPercent)} %
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
            {data[view].length === 0 && <p>No hay registros para mostrar.</p>}
          </section>
          <section className="card">
            <h2>Días con menor ocupación</h2>
            <p className="muted">
              Los siete días de menor ocupación del período, incluidos los que
              no tienen reservas. Sirven para evaluar promociones; no se aplican
              descuentos automáticamente.
            </p>
            {quietDays.length ? (
              <div className="table-scroll">
                <table aria-label="Días con menor ocupación">
                  <thead>
                    <tr>
                      <th>Día (UTC)</th>
                      <th>Horas reservadas</th>
                      <th>Ocupación teórica</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quietDays.map((day) => (
                      <tr key={day.date}>
                        <td>{dayLabel(day.date)}</td>
                        <td>{number(day.bookedHours)} h</td>
                        <td>{number(day.occupancyPercent)} %</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No hay capacidad registrada en este período.</p>
            )}
          </section>
          <details className="filter-disclosure">
            <summary>Distribución por horario (UTC)</summary>
            <p className="muted">
              Suma de horas reservadas en cada franja, para todos los días del
              período.
            </p>
            <div className="hour-chart">
              {data.hours.map((hour) => (
                <div key={hour.hour}>
                  <span>{String(hour.hour).padStart(2, '0')}:00</span>
                  <meter
                    min={0}
                    max={Math.max(
                      1,
                      ...data.hours.map((item) => item.bookedHours),
                    )}
                    value={hour.bookedHours}
                    aria-label={`Horas reservadas a las ${hour.hour}`}
                  />
                  <span>{number(hour.bookedHours)} h</span>
                </div>
              ))}
            </div>
          </details>
          <p className="muted hint">
            Calculado: {new Date(data.generatedAt).toLocaleString('es-AR')}.
            Actualizá para consultar los cambios recientes.
          </p>
        </>
      )}
    </>
  );
}
