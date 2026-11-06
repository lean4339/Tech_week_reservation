'use client';
import { useState, type FormEvent } from 'react';
import { errorMessage, type Room } from '@/lib/business';
import { useBusinessRequest } from './use-business-request';
import Link from 'next/link';
import { EntitySelect } from './entity-select';
import { useResource } from './use-resource';
import { Dialog, ConfirmAction, Feedback, Pagination } from './shared';

export function RoomManager() {
  const businessRequest = useBusinessRequest();
  const [buildingId, setBuildingId] = useState('');
  const [offset, setOffset] = useState(0);
  const rooms = useResource<{ rooms: Room[] }>(
    `/rooms?${new URLSearchParams({ limit: '20', offset: String(offset), ...(buildingId ? { buildingId } : {}) })}`,
  );
  const [editor, setEditor] = useState<Room | 'new' | null>(null);
  const [deactivating, setDeactivating] = useState<Room>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''),
    [message, setMessage] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !editor) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await businessRequest(
        editor === 'new' ? '/rooms' : `/rooms/${encodeURIComponent(editor.id)}`,
        {
          method: editor === 'new' ? 'POST' : 'PATCH',
          body: {
            buildingId: String(data.get('buildingId')),
            name: String(data.get('name')).trim(),
            location: String(data.get('location')).trim() || null,
            capacity: Number(data.get('capacity')),
            active: data.get('active') === 'on',
          },
        },
      );
      setMessage(editor === 'new' ? 'Sala creada.' : 'Sala actualizada.');
      setEditor(null);
      rooms.reload();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function deactivate() {
    if (busy || !deactivating) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await businessRequest(`/rooms/${encodeURIComponent(deactivating.id)}`, {
        method: 'DELETE',
        body: {},
      });
      setDeactivating(undefined);
      setMessage('Sala desactivada. Las reservas existentes se conservan.');
      rooms.reload();
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
          Administrá capacidad, ubicación y disponibilidad para nuevas reservas.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setEditor('new');
            setDeactivating(undefined);
            setError('');
            setMessage('');
          }}
        >
          Crear sala
        </button>
      </div>
      <details className="filter-disclosure">
        <summary>Filtrar por edificio</summary>
        <EntitySelect
          kind="buildings"
          name="filterBuildingId"
          label="Filtrar por edificio"
          onChange={(id) => {
            setBuildingId(id);
            setOffset(0);
          }}
        />
        <p className="muted hint">
          Las salas sin edificio se conservan para que puedas asignarlas.{' '}
          <Link href="/admin/buildings">Gestionar edificios</Link>
        </p>
      </details>
      <Feedback
        error={editor || deactivating ? undefined : error || rooms.error}
        message={message}
      />
      {editor && (
        <Dialog
          title={editor === 'new' ? 'Crear sala' : 'Editar sala'}
          busy={busy}
          close={() => setEditor(null)}
        >
          <section
            className="card editor-panel"
            aria-label={editor === 'new' ? 'Crear sala' : 'Editar sala'}
          >
            <h2>{editor === 'new' ? 'Crear sala' : 'Editar sala'}</h2>
            <Feedback error={error} />
            <form key={editor === 'new' ? 'new' : editor.id} onSubmit={save}>
              <fieldset disabled={busy}>
                <div className="form-grid">
                  <EntitySelect
                    kind="buildings"
                    name="buildingId"
                    label="Edificio de la sala"
                    required
                    activeOnly={editor === 'new'}
                    initialSelection={
                      editor !== 'new' && editor.buildingId
                        ? {
                            id: editor.buildingId,
                            label: editor.buildingName ?? 'Edificio asignado',
                          }
                        : undefined
                    }
                  />
                  <label>
                    Nombre de la sala
                    <input
                      name="name"
                      minLength={2}
                      maxLength={120}
                      required
                      defaultValue={editor === 'new' ? '' : editor.name}
                    />
                  </label>
                  <label>
                    Piso o ubicación dentro del edificio
                    <input
                      name="location"
                      minLength={2}
                      maxLength={254}
                      defaultValue={
                        editor === 'new' ? '' : (editor.location ?? '')
                      }
                    />
                  </label>
                  <label>
                    Capacidad
                    <input
                      name="capacity"
                      type="number"
                      min={1}
                      max={100000}
                      step={1}
                      required
                      defaultValue={editor === 'new' ? 8 : editor.capacity}
                    />
                  </label>
                  <label className="checkbox-label">
                    <input
                      name="active"
                      type="checkbox"
                      defaultChecked={editor === 'new' || editor.active}
                    />
                    Activa para nuevas reservas
                  </label>
                </div>
                <div className="actions">
                  <button type="submit">
                    {busy ? 'Guardando…' : 'Guardar sala'}
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => setEditor(null)}
                  >
                    Descartar cambios
                  </button>
                </div>
              </fieldset>
            </form>
          </section>
        </Dialog>
      )}
      {deactivating && (
        <ConfirmAction
          title="Desactivar sala"
          busy={busy}
          error={error}
          confirm={deactivate}
          cancel={() => setDeactivating(undefined)}
        >
          <p>
            ¿Desactivar <strong>{deactivating.name}</strong>? No aceptará nuevas
            reservas. Las reservas existentes seguirán vigentes.
          </p>
        </ConfirmAction>
      )}
      <section className="card">
        <div className="section-heading">
          <h2>Salas</h2>
          <button
            type="button"
            className="secondary"
            disabled={rooms.loading || busy}
            onClick={rooms.reload}
          >
            Actualizar salas
          </button>
        </div>
        {rooms.loading ? (
          <p role="status">Cargando salas…</p>
        ) : rooms.data?.rooms.length === 0 ? (
          <p>
            No hay salas todavía. Creá la primera para empezar a recibir
            reservas.
          </p>
        ) : (
          <div className="table-scroll">
            <table aria-label="Salas">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Edificio</th>
                  <th>Ubicación</th>
                  <th>Capacidad</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rooms.data?.rooms.map((room) => (
                  <tr key={room.id}>
                    <td>{room.name}</td>
                    <td>
                      {room.buildingName ?? 'Sin edificio asignado'}
                      {room.buildingId && !room.buildingActive && (
                        <small className="muted"> (inactivo)</small>
                      )}
                    </td>
                    <td>{room.location ?? 'Sin ubicación'}</td>
                    <td>{room.capacity} personas</td>
                    <td>
                      <span
                        className={`badge ${room.active ? 'available' : ''}`}
                      >
                        {room.active ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td>
                      <div className="actions">
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          onClick={() => {
                            setEditor(room);
                            setDeactivating(undefined);
                            setError('');
                            setMessage('');
                          }}
                        >
                          Editar
                        </button>
                        {room.active && (
                          <button
                            type="button"
                            className="danger-outline"
                            disabled={busy}
                            onClick={() => {
                              setDeactivating(room);
                              setEditor(null);
                              setError('');
                            }}
                          >
                            Desactivar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          offset={offset}
          count={rooms.data?.rooms.length ?? 0}
          size={20}
          loading={rooms.loading || busy}
          change={setOffset}
        />
      </section>
    </>
  );
}
