'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  errorMessage,
  reservationPeriod,
  dateRange,
  inputDate,
  displayDate,
  type Reservation,
} from '@/lib/business';
import { useBusinessRequest } from './use-business-request';
import { useResource } from './use-resource';
import {
  Dialog,
  ConfirmAction,
  Feedback,
  Pagination,
  PeriodFields,
} from './shared';
import { EntitySelect } from './entity-select';

type Filters = {
  buildingId: string;
  from: string;
  to: string;
  roomId: string;
  userId: string;
  status: string;
};
const defaultFilters: Filters = {
  from: '',
  to: '',
  buildingId: '',
  roomId: '',
  userId: '',
  status: 'active',
};
export function ReservationManager({ admin = false }: { admin?: boolean }) {
  const businessRequest = useBusinessRequest();
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [selectedBuilding, setSelectedBuilding] = useState('');
  const [filterKey, setFilterKey] = useState(0),
    [offset, setOffset] = useState(0);
  const base = admin ? '/admin/reservations' : '/reservations';
  const query = new URLSearchParams({
    ...dateRange(filters.from, filters.to),
    limit: '20',
    offset: String(offset),
    status: filters.status,
    ...(filters.buildingId ? { buildingId: filters.buildingId } : {}),
    ...(filters.roomId ? { roomId: filters.roomId } : {}),
    ...(admin && filters.userId ? { userId: filters.userId } : {}),
  });
  const list = useResource<{ reservations: Reservation[] }>(`${base}?${query}`);
  const [editing, setEditing] = useState<Reservation | 'new' | null>(null),
    [cancelling, setCancelling] = useState<Reservation>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const data = new FormData(event.currentTarget);
    const next = {
      from: String(data.get('from')),
      to: String(data.get('to')),
      status: filters.status,
      roomId: String(data.get('roomId') ?? ''),
      buildingId: String(data.get('buildingId') ?? ''),
      userId: String(data.get('userId') ?? ''),
    };
    try {
      dateRange(next.from, next.to);
      setFilters(next);
      setOffset(0);
      list.reload();
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const period = reservationPeriod(data);
      await businessRequest(
        editing === 'new' ? base : `${base}/${encodeURIComponent(editing.id)}`,
        {
          method: editing === 'new' ? 'POST' : 'PATCH',
          body: {
            ...period,
            ...(editing === 'new'
              ? {
                  roomId: String(data.get('roomId')),
                  userId: String(data.get('userId')),
                }
              : {}),
          },
        },
      );
      setMessage(
        editing === 'new' ? 'Reserva creada.' : 'Reserva reprogramada.',
      );
      setEditing(null);
      setOffset(0);
      list.reload();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!cancelling || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await businessRequest(`${base}/${encodeURIComponent(cancelling.id)}`, {
        method: 'DELETE',
        body: {},
      });
      setMessage(
        'Reserva cancelada. Podés consultarla con el filtro de canceladas.',
      );
      setCancelling(undefined);
      list.reload();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="section-heading">
        <p className="muted">
          {admin
            ? 'Consultá la ocupación y gestioná las reservas de tus clientes.'
            : 'Consultá tus reservas, cambiá el horario o cancelá cuando lo necesites.'}
        </p>
        {admin ? (
          <button
            disabled={busy}
            onClick={() => {
              setEditing('new');
              setCancelling(undefined);
              setError('');
              setMessage('');
            }}
          >
            Crear reserva
          </button>
        ) : (
          <Link className="action-link" href="/dashboard">
            Reservar una sala
          </Link>
        )}
      </div>
      <Feedback
        error={editing || cancelling ? undefined : error || list.error}
        message={message}
      />
      {editing && (
        <Dialog
          title={editing === 'new' ? 'Crear reserva' : 'Reprogramar reserva'}
          busy={busy}
          close={() => setEditing(null)}
        >
          <section
            className="card editor-panel"
            aria-label={
              editing === 'new' ? 'Crear reserva' : 'Reprogramar reserva'
            }
          >
            <h2>
              {editing === 'new'
                ? 'Crear reserva para un cliente'
                : `Reprogramar: ${editing.roomName}`}
            </h2>
            <Feedback error={error} />
            <form key={editing === 'new' ? 'new' : editing.id} onSubmit={save}>
              <fieldset disabled={busy}>
                {editing === 'new' && (
                  <div className="form-grid">
                    <EntitySelect
                      kind="rooms"
                      name="roomId"
                      label="Sala de la reserva"
                      required
                      activeOnly
                    />
                    <EntitySelect
                      kind="clients"
                      name="userId"
                      label="Empresa de la reserva"
                      required
                    />
                  </div>
                )}
                <PeriodFields
                  startsAt={
                    editing === 'new' ? '' : inputDate(editing.startsAt)
                  }
                  endsAt={editing === 'new' ? '' : inputDate(editing.endsAt)}
                />
                <div className="actions">
                  <button type="submit">
                    {busy ? 'Guardando…' : 'Guardar reserva'}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setEditing(null)}
                  >
                    Descartar cambios
                  </button>
                </div>
              </fieldset>
            </form>
          </section>
        </Dialog>
      )}
      {cancelling && (
        <ConfirmAction
          title="Cancelar reserva"
          busy={busy}
          error={error}
          confirm={cancel}
          cancel={() => setCancelling(undefined)}
        >
          <p>
            ¿Cancelar la reserva de <strong>{cancelling.roomName}</strong> del{' '}
            {displayDate(cancelling.startsAt)}? La sala quedará libre para ese
            período.
          </p>
        </ConfirmAction>
      )}
      <div className="list-toolbar">
        <div className="compact-field">
          <label htmlFor="reservation-status">Estado</label>
          <select
            id="reservation-status"
            value={filters.status}
            disabled={busy}
            onChange={(event) => {
              setFilters({ ...filters, status: event.target.value });
              setOffset(0);
            }}
          >
            <option value="active">Vigentes</option>
            <option value="cancelled">Canceladas</option>
            <option value="all">Todas</option>
          </select>
        </div>
        {Object.entries(filters).some(([key, value]) =>
          key === 'status' ? value !== 'active' : Boolean(value),
        ) && (
          <button
            className="secondary"
            onClick={() => {
              setFilters(defaultFilters);
              setSelectedBuilding('');
              setFilterKey((value) => value + 1);
              setOffset(0);
              setError('');
              setMessage('');
            }}
          >
            Quitar filtros
          </button>
        )}
      </div>
      <details className="filter-disclosure">
        <summary>
          Filtrar reservas
          {filters.from ||
          filters.to ||
          filters.buildingId ||
          filters.roomId ||
          filters.userId
            ? ' · Filtros aplicados'
            : ''}
        </summary>
        <p className="muted">
          Las fechas son opcionales. Podés indicar solo desde, solo hasta o
          dejarlas vacías.
        </p>
        <form key={filterKey} onSubmit={filter} aria-label="Filtrar reservas">
          <fieldset disabled={busy}>
            <div className="form-grid filters-grid">
              <label>
                Desde
                <input name="from" type="date" defaultValue={filters.from} />
              </label>
              <label>
                Hasta
                <input name="to" type="date" defaultValue={filters.to} />
              </label>
              <EntitySelect
                kind="buildings"
                name="buildingId"
                label="Edificio"
                onChange={setSelectedBuilding}
              />
              <EntitySelect
                key={selectedBuilding}
                kind="rooms"
                name="roomId"
                label="Sala"
                buildingId={selectedBuilding}
              />
              {admin && (
                <EntitySelect kind="clients" name="userId" label="Empresa" />
              )}
            </div>
            <div className="actions">
              <button type="submit" disabled={list.loading}>
                Aplicar filtros
              </button>
            </div>
          </fieldset>
        </form>
      </details>
      <section className="card">
        <div className="section-heading">
          <h2>{admin ? 'Agenda de reservas' : 'Mis reservas'}</h2>
          <button
            className="secondary"
            disabled={busy || list.loading}
            onClick={list.reload}
          >
            Actualizar reservas
          </button>
        </div>
        <p className="muted hint">
          Horarios en la zona horaria de tu dispositivo.{' '}
          {filters.from || filters.to
            ? 'Se muestran reservas que coinciden con las fechas elegidas.'
            : 'Mostrando reservas de cualquier fecha.'}
        </p>
        {list.loading ? (
          <p role="status">Cargando reservas…</p>
        ) : list.data?.reservations.length === 0 ? (
          <p className="empty-state">
            {Object.entries(filters).some(([key, value]) =>
              key === 'status' ? value !== 'active' : Boolean(value),
            )
              ? 'No hay reservas para estos filtros. Podés quitarlos para volver al listado.'
              : 'Todavía no hay reservas vigentes.'}
          </p>
        ) : (
          <div className="table-scroll">
            <table aria-label={admin ? 'Agenda de reservas' : 'Mis reservas'}>
              <thead>
                <tr>
                  <th>Edificio</th>
                  <th>Sala</th>
                  {admin && <th>Empresa</th>}
                  <th>Inicio</th>
                  <th>Fin</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {list.data?.reservations.map((reservation) => (
                  <tr key={reservation.id}>
                    <td>
                      {reservation.buildingName ?? 'Sin edificio asignado'}
                    </td>
                    <td>{reservation.roomName}</td>
                    {admin && (
                      <td>
                        {reservation.businessName ?? 'Empresa sin nombre'}
                      </td>
                    )}
                    <td>{displayDate(reservation.startsAt)}</td>
                    <td>{displayDate(reservation.endsAt)}</td>
                    <td>
                      <span
                        className={`badge ${reservation.cancelledAt ? '' : 'available'}`}
                      >
                        {reservation.cancelledAt ? 'Cancelada' : 'Vigente'}
                      </span>
                    </td>
                    <td>
                      {!reservation.cancelledAt && (
                        <div className="actions">
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => {
                              setEditing(reservation);
                              setCancelling(undefined);
                              setError('');
                              setMessage('');
                            }}
                          >
                            Reprogramar
                          </button>
                          <button
                            className="danger-outline"
                            disabled={busy}
                            onClick={() => {
                              setCancelling(reservation);
                              setEditing(null);
                              setError('');
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          offset={offset}
          count={list.data?.reservations.length ?? 0}
          size={20}
          loading={list.loading || busy}
          change={setOffset}
        />
      </section>
    </>
  );
}
