import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  /** When set, confirm stays disabled until the user types this exact text. */
  confirmText?: string;
}

export function ConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  confirmText,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!isOpen) setTyped('');
  }, [isOpen]);

  const canConfirm = !confirmText || typed === confirmText;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      size="small"
      variant={variant === 'destructive' ? 'confirm' : 'slab'}
    >
      <div className="p-2">
        <h3 className="font-display text-lg font-semibold text-ink-primary">{title}</h3>
        <div className="mt-2 text-sm text-ink-secondary">
          {typeof message === 'string' ? <p>{message}</p> : message}
        </div>
        {confirmText ? (
          <div className="mt-4">
            <label htmlFor="confirm-type-text" className="mb-1.5 block text-xs text-ink-muted">
              Type <span className="font-mono font-semibold text-ink-primary">{confirmText}</span> to
              confirm
            </label>
            <input
              id="confirm-type-text"
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="input h-9 w-full font-mono"
              autoComplete="off"
              autoFocus
            />
          </div>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="btn-secondary">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className={
              variant === 'destructive'
                ? 'btn-destructive disabled:cursor-not-allowed disabled:opacity-40'
                : 'btn-primary disabled:cursor-not-allowed disabled:opacity-40'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
