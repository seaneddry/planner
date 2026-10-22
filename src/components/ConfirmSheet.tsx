interface ConfirmSheetProps {
  title: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** iOS-style action sheet used for destructive confirmations. */
export function ConfirmSheet({ title, confirmLabel, danger, onConfirm, onCancel }: ConfirmSheetProps) {
  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="action-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="action-group">
          <div className="action-title">{title}</div>
          <button className={`action ${danger ? 'action-danger' : ''}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
        <button className="action action-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
