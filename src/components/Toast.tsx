import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface ToastAction {
  label: string;
  run: () => void;
}

type ShowToast = (message: string, action?: ToastAction) => void;

const ToastContext = createContext<ShowToast>(() => {});

/** A short message at the bottom of the screen, optionally with one action such as Undo. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; action?: ToastAction; key: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback<ShowToast>((message, action) => {
    window.clearTimeout(timer.current);
    setToast({ message, action, key: Date.now() });
    timer.current = window.setTimeout(() => setToast(null), action ? 4500 : 2400);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <div className={`toast ${toast.action ? 'has-action' : ''}`} role="status" key={toast.key}>
          <span>{toast.message}</span>
          {toast.action ? (
            <button
              className="toast-action"
              onClick={() => {
                window.clearTimeout(timer.current);
                setToast(null);
                toast.action?.run();
              }}
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  return useContext(ToastContext);
}
