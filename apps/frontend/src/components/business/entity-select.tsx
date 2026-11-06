'use client';
import { useEffect, useId, useState } from 'react';
import { useResource } from './use-resource';
import { Feedback } from './shared';
import type { Room, ClientBusiness, Building } from '@/lib/business';

export function EntitySelect({
  kind,
  name,
  label,
  required = false,
  activeOnly = false,
  initialSelection,
  buildingId,
  onChange,
}: {
  kind: 'rooms' | 'clients' | 'buildings';
  name: string;
  label: string;
  required?: boolean;
  activeOnly?: boolean;
  initialSelection?: { id: string; label: string };
  buildingId?: string;
  onChange?: (id: string) => void;
}) {
  const id = useId();
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<
    { id: string; label: string } | undefined
  >(initialSelection);
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  useEffect(() => {
    const timeout = setTimeout(() => setSearchQuery(search), 300);
    return () => clearTimeout(timeout);
  }, [search]);
  const result = useResource<{
    rooms?: Room[];
    clients?: ClientBusiness[];
    buildings?: Building[];
  }>(
    `${kind === 'rooms' ? '/rooms' : kind === 'buildings' ? '/buildings' : '/admin/clients'}?${new URLSearchParams({ limit: '50', offset: String(offset), ...(kind === 'clients' ? { search: searchQuery } : {}), ...(kind === 'rooms' && buildingId ? { buildingId } : {}) })}`,
  );
  const rows =
    kind === 'rooms'
      ? (result.data?.rooms ?? [])
      : kind === 'buildings'
        ? (result.data?.buildings ?? [])
        : (result.data?.clients ?? []);
  const options = rows
    .filter(
      (row) =>
        !activeOnly ||
        !('active' in row) ||
        (row.active &&
          (!('buildingActive' in row) || row.buildingActive === true)),
    )
    .map((row) => ({
      id: row.id,
      label:
        'name' in row
          ? `${row.name}${'buildingName' in row ? ` — ${row.buildingName ?? 'Sin edificio asignado'}` : ''}${'address' in row ? ` — ${row.address}` : ''}${row.active ? '' : ' (inactivo)'}`
          : `${row.businessName ?? 'Empresa sin nombre'} · ${row.id.slice(0, 8)}`,
    }));
  return (
    <div className="entity-select">
      <label htmlFor={id}>{label}</label>
      {kind === 'clients' && (
        <input
          aria-label={`Buscar ${label.toLowerCase()}`}
          type="search"
          maxLength={120}
          placeholder="Buscar por nombre"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setOffset(0);
          }}
        />
      )}
      <select
        id={id}
        name={name}
        required={required}
        value={selected?.id ?? ''}
        onChange={(event) => {
          setSelected(
            options.find((option) => option.id === event.target.value),
          );
          onChange?.(event.target.value);
        }}
      >
        <option value="">{required ? 'Seleccioná una opción' : 'Todas'}</option>
        {selected && !options.some((option) => option.id === selected.id) && (
          <option value={selected.id}>{selected.label}</option>
        )}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {result.loading && <small role="status">Cargando opciones…</small>}
      {!result.loading && !result.error && !options.length && (
        <small>No hay opciones en esta página.</small>
      )}
      <Feedback error={result.error} />
      <div className="option-pages">
        {offset > 0 && (
          <button
            className="text-button"
            type="button"
            disabled={result.loading}
            onClick={() => setOffset(offset - 50)}
          >
            Opciones anteriores
          </button>
        )}
        {rows.length === 50 && offset < 10000 && (
          <button
            className="text-button"
            type="button"
            disabled={result.loading}
            onClick={() => setOffset(offset + 50)}
          >
            Más opciones
          </button>
        )}
        {result.error && (
          <button type="button" className="text-button" onClick={result.reload}>
            Reintentar opciones
          </button>
        )}
      </div>
    </div>
  );
}
