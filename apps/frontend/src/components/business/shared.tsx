'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Dialog({
  title,
  busy,
  close,
  children,
}: {
  title: string;
  busy: boolean;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="workspace-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
    >
      <button
        type="button"
        className="secondary dialog-close"
        aria-label="Cerrar formulario"
        disabled={busy}
        onClick={close}
      >
        Cerrar
      </button>
      {children}
    </dialog>
  );
}

export function Feedback({
  error,
  message,
}: {
  error?: string;
  message?: string;
}) {
  return (
    <>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
    </>
  );
}
export function PeriodFields({
  startsAt = '',
  endsAt = '',
}: {
  startsAt?: string;
  endsAt?: string;
}) {
  const id = useId();
  return (
    <div className="form-grid">
      <label htmlFor={`${id}-start`}>
        Inicio
        <input
          id={`${id}-start`}
          type="datetime-local"
          name="startsAt"
          defaultValue={startsAt}
          required
        />
      </label>
      <label htmlFor={`${id}-end`}>
        Fin
        <input
          id={`${id}-end`}
          type="datetime-local"
          name="endsAt"
          defaultValue={endsAt}
          required
        />
      </label>
      <p className="muted hint full-width">
        Las fechas y horas se muestran en la zona horaria de tu dispositivo.
      </p>
    </div>
  );
}
export function Pagination({
  offset,
  count,
  size,
  loading,
  change,
}: {
  offset: number;
  count: number;
  size: number;
  loading: boolean;
  change: (offset: number) => void;
}) {
  if (offset === 0 && count < size) return null;
  return (
    <div className="pagination">
      <button
        type="button"
        className="secondary"
        disabled={!offset || loading}
        onClick={() => change(Math.max(0, offset - size))}
      >
        Anterior
      </button>
      <span>Página {Math.floor(offset / size) + 1}</span>
      <button
        type="button"
        className="secondary"
        disabled={count < size || loading || offset + size > 10000}
        onClick={() => change(offset + size)}
      >
        Siguiente
      </button>
    </div>
  );
}
export function ConfirmAction({
  title,
  children,
  busy,
  cancel,
  confirm,
  error,
}: {
  title: string;
  children: ReactNode;
  busy: boolean;
  cancel: () => void;
  confirm: () => void;
  error?: string;
}) {
  return (
    <Dialog title={title} busy={busy} close={cancel}>
      <section className="confirm-panel" aria-label={title}>
        <h3>{title}</h3>
        {children}
        <Feedback error={error} />
        <div className="actions">
          <button
            type="button"
            className="danger"
            disabled={busy}
            onClick={confirm}
          >
            {busy ? 'Procesando…' : 'Confirmar'}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={cancel}
          >
            Volver
          </button>
        </div>
      </section>
    </Dialog>
  );
}
