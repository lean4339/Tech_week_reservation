'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  errorMessage,
  reservationPeriod,
  displayDate,
  inputDate,
  type Room,
} from '@/lib/business';
import { useBusinessRequest } from './use-business-request';
import { EntitySelect } from './entity-select';
import { useResource } from './use-resource';
import { Dialog, Feedback, Pagination, PeriodFields } from './shared';

export function RoomExplorer() {
  const businessRequest = useBusinessRequest();
  const [period, setPeriod] = useState<{ startsAt: string; endsAt: string }>();
  const [buildingId, setBuildingId] = useState('');
  const [periodKey, setPeriodKey] = useState(0);
  const [offset, setOffset] = useState(0);
  const query = new URLSearchParams({
    ...(buildingId ? { buildingId } : {}),
    limit: '12',
    offset: String(offset),
    ...(period ? { from: period.startsAt, to: period.endsAt } : {}),
  });
  const rooms = useResource<{ rooms: Room[] }>(`/rooms?${query}`);
  const [selected, setSelected] = useState<Room>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSelected(undefined);
    try {
      setPeriod(reservationPeriod(new FormData(event.currentTarget)));
      setOffset(0);
      rooms.reload();
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  async function reserve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const bookingPeriod = reservationPeriod(data);
      await businessRequest('/reservations', {
        method: 'POST',
        body: { roomId: selected.id, ...bookingPeriod },
      });
      setMessage(`Reserva confirmada en ${selected.name}.`);
      setSelected(undefined);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
      rooms.reload();
    }
  }
  return (
    <>
      <p className="muted">Elegí una sala y reservá tu horario.</p>
      <details className="filter-disclosure">
        <summary>
          Buscar por edificio u horario
          {period || buildingId ? ' · Filtros aplicados' : ''}
        </summary>
        <p className="muted">
          Elegí fecha y horario para conocer qué salas están disponibles.
        </p>
        <form onSubmit={search}>
          <fieldset disabled={busy}>
            <EntitySelect
              kind="buildings"
              name="buildingId"
              label="Edificio"
              onChange={(id) => {
                setBuildingId(id);
                setOffset(0);
                setSelected(undefined);
              }}
            />
            <PeriodFields key={periodKey} />
            <button type="submit" disabled={rooms.loading}>
              Consultar disponibilidad
            </button>
          </fieldset>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setPeriodKey((value) => value + 1);
              setError('');
              setPeriod(undefined);
              setOffset(0);
            }}
          >
            Quitar horario
          </button>
        </form>
      </details>
      <Feedback
        error={selected ? undefined : error || rooms.error}
        message={message}
      />
      {message && (
        <p>
          <Link href="/reservations">Ver mis reservas →</Link>
        </p>
      )}
      {selected && (
        <Dialog
          title="Confirmar reserva"
          busy={busy}
          close={() => {
            setSelected(undefined);
            setError('');
          }}
        >
          <section aria-label="Confirmar reserva">
            <h2>Reservar {selected.name}</h2>
            <p className="muted">
              {selected.buildingName} · Hasta {selected.capacity} personas
            </p>
            <Feedback error={error} />
            <form onSubmit={reserve}>
              <fieldset disabled={busy}>
                <PeriodFields
                  startsAt={period ? inputDate(period.startsAt) : ''}
                  endsAt={period ? inputDate(period.endsAt) : ''}
                />
                <button type="submit">
                  {busy ? 'Reservando…' : 'Confirmar'}
                </button>
              </fieldset>
            </form>
          </section>
        </Dialog>
      )}
      <div className="section-heading">
        <h2>
          {period ? 'Disponibilidad para el período elegido' : 'Nuestras salas'}
        </h2>
        <button
          className="secondary"
          disabled={rooms.loading || busy}
          onClick={rooms.reload}
        >
          Actualizar disponibilidad
        </button>
      </div>
      {period && (
        <p className="muted">
          {displayDate(period.startsAt)} — {displayDate(period.endsAt)}
        </p>
      )}
      {rooms.loading ? (
        <p role="status">Consultando salas…</p>
      ) : rooms.data?.rooms.length === 0 ? (
        <section className="card">
          <p>No hay salas disponibles para consultar en esta página.</p>
        </section>
      ) : (
        <div className="room-grid">
          {rooms.data?.rooms.map((room) => (
            <article className="card room-card" key={room.id}>
              <span className="eyebrow">SALA</span>
              <h3>{room.name}</h3>
              <p>
                <strong>{room.buildingName}</strong>
                <br />
                {room.buildingAddress}
              </p>
              <p>{room.location ?? 'Ubicación por confirmar'}</p>
              <p className="muted">Hasta {room.capacity} personas</p>
              {period && (
                <span
                  className={`badge ${room.available ? 'available' : 'unavailable'}`}
                >
                  {room.available ? 'Disponible' : 'Ocupada en este horario'}
                </span>
              )}
              <button
                disabled={busy}
                onClick={() => {
                  setSelected(room);
                  setError('');
                  setMessage('');
                }}
              >
                Reservar {room.name}
              </button>
            </article>
          ))}
        </div>
      )}
      <Pagination
        offset={offset}
        count={rooms.data?.rooms.length ?? 0}
        size={12}
        loading={rooms.loading || busy}
        change={setOffset}
      />
    </>
  );
}
