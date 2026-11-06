'use client';
import { useState, type FormEvent } from 'react';
import { errorMessage, type Building } from '@/lib/business';
import { useBusinessRequest } from './use-business-request';
import { useResource } from './use-resource';
import { Dialog, ConfirmAction, Feedback, Pagination } from './shared';

export function BuildingManager() {
  const request = useBusinessRequest();
  const [offset, setOffset] = useState(0);
  const list = useResource<{ buildings: Building[] }>(
    `/buildings?limit=20&offset=${offset}`,
  );
  const [editor, setEditor] = useState<Building | 'new' | null>(null);
  const [deactivating, setDeactivating] = useState<Building>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !editor) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await request(
        editor === 'new'
          ? '/buildings'
          : `/buildings/${encodeURIComponent(editor.id)}`,
        {
          method: editor === 'new' ? 'POST' : 'PATCH',
          body: {
            name: String(data.get('name')).trim(),
            address: String(data.get('address')).trim(),
            active: data.get('active') === 'on',
          },
        },
      );
      setMessage(
        editor === 'new'
          ? 'Edificio creado. Ya podés asignarle salas.'
          : 'Edificio actualizado.',
      );
      setEditor(null);
      list.reload();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function deactivate() {
    if (!deactivating || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await request(`/buildings/${encodeURIComponent(deactivating.id)}`, {
        method: 'DELETE',
        body: {},
      });
      setMessage(
        'Edificio desactivado. Se conservan las salas y reservas existentes.',
      );
      setDeactivating(undefined);
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
        <p className="muted">Organizá las salas por edificio y dirección.</p>
        <button
          disabled={busy}
          onClick={() => {
            setEditor('new');
            setDeactivating(undefined);
            setError('');
            setMessage('');
          }}
        >
          Crear edificio
        </button>
      </div>
      <Feedback
        error={editor || deactivating ? undefined : error || list.error}
        message={message}
      />
      {editor && (
        <Dialog
          title={editor === 'new' ? 'Crear edificio' : 'Editar edificio'}
          busy={busy}
          close={() => setEditor(null)}
        >
          <section
            className="card editor-panel"
            aria-label={editor === 'new' ? 'Crear edificio' : 'Editar edificio'}
          >
            <h2>{editor === 'new' ? 'Crear edificio' : 'Editar edificio'}</h2>
            <Feedback error={error} />
            <form key={editor === 'new' ? 'new' : editor.id} onSubmit={save}>
              <fieldset disabled={busy}>
                <div className="form-grid">
                  <label>
                    Nombre del edificio
                    <input
                      name="name"
                      minLength={2}
                      maxLength={120}
                      required
                      defaultValue={editor === 'new' ? '' : editor.name}
                    />
                  </label>
                  <label>
                    Dirección
                    <input
                      name="address"
                      minLength={2}
                      maxLength={254}
                      required
                      defaultValue={editor === 'new' ? '' : editor.address}
                    />
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      name="active"
                      defaultChecked={editor === 'new' || editor.active}
                    />
                    Edificio activo
                  </label>
                </div>
                <div className="actions">
                  <button type="submit">
                    {busy ? 'Guardando…' : 'Guardar edificio'}
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
          title="Desactivar edificio"
          busy={busy}
          error={error}
          confirm={deactivate}
          cancel={() => setDeactivating(undefined)}
        >
          <p>
            ¿Desactivar <strong>{deactivating.name}</strong>? Sus salas dejarán
            de aceptar nuevas reservas y reprogramaciones. Las reservas vigentes
            no se cancelarán.
          </p>
        </ConfirmAction>
      )}
      <section className="card">
        <div className="section-heading">
          <h2>Edificios</h2>
          <button
            className="secondary"
            disabled={busy || list.loading}
            onClick={list.reload}
          >
            Actualizar edificios
          </button>
        </div>
        {list.loading ? (
          <p role="status">Cargando edificios…</p>
        ) : list.data?.buildings.length === 0 ? (
          <p>
            No hay edificios todavía. Creá el primero y después asignale salas.
          </p>
        ) : (
          <div className="table-scroll">
            <table aria-label="Edificios">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Dirección</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {list.data?.buildings.map((building) => (
                  <tr key={building.id}>
                    <td>{building.name}</td>
                    <td>{building.address}</td>
                    <td>
                      <span
                        className={`badge ${building.active ? 'available' : ''}`}
                      >
                        {building.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <div className="actions">
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => {
                            setEditor(building);
                            setDeactivating(undefined);
                            setError('');
                            setMessage('');
                          }}
                        >
                          Editar
                        </button>
                        {building.active && (
                          <button
                            className="danger-outline"
                            disabled={busy}
                            onClick={() => {
                              setDeactivating(building);
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
          count={list.data?.buildings.length ?? 0}
          size={20}
          loading={list.loading || busy}
          change={setOffset}
        />
      </section>
    </>
  );
}
