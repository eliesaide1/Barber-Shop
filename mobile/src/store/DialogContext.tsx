import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Dialog, DialogTone } from '../components/Dialog';

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Emoji shown in a tinted disc above the title. */
  icon?: string;
  tone?: DialogTone;
  /** The affirmative action. Defaults to "Confirm" / "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  dismissible?: boolean;
}

interface DialogContextValue {
  /** Resolves true if the user confirmed, false if they cancelled or dismissed. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** A single-button acknowledgement. Resolves when dismissed. */
  alert: (options: Omit<ConfirmOptions, 'cancelLabel'>) => Promise<void>;
  /**
   * Something failed and the user needs to know.
   *
   * `message` is usually the sentence the API sent back — those are written to
   * be read by a person ("Only 3 left of Matte Clay Pomade"), so they carry the
   * detail. `title` says which action failed, and is worth passing at every
   * call site: "Order not placed" tells you where you stand, "Something went
   * wrong" does not.
   */
  showError: (message: string, options?: { title?: string; icon?: string }) => Promise<void>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

interface Request extends ConfirmOptions {
  confirmLabel: string;
  cancelLabel?: string;
}

/**
 * Imperative dialogs, so a call site reads about as short as `Alert.alert` did
 * but renders the app's own component:
 *
 *   const { confirm } = useDialog();
 *   if (await confirm({ title: 'Cancel this booking?', tone: 'danger' })) { … }
 *
 * Awaiting the answer — rather than passing callbacks into a button array —
 * also keeps the follow-up logic in the function that asked the question.
 */
export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const [visible, setVisible] = useState(false);
  /* Holding the resolver in a ref, and clearing it the moment we settle, makes
     it impossible to resolve the same promise twice — a double tap on the
     confirm button while the exit animation runs would otherwise do exactly
     that, and the caller would run its action twice. */
  const pending = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    const resolve = pending.current;
    if (!resolve) return;
    pending.current = null;
    setVisible(false);
    resolve(value);
    /* Let the fade finish before unmounting the content, so the text doesn't
       vanish a frame before the box does. */
    setTimeout(() => setRequest((current) => (pending.current ? current : null)), 200);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) => {
      /* A second dialog while one is open would orphan the first promise. */
      if (pending.current) settle(false);

      return new Promise<boolean>((resolve) => {
        pending.current = resolve;
        setRequest({
          ...options,
          confirmLabel: options.confirmLabel ?? 'Confirm',
          cancelLabel: options.cancelLabel ?? 'Cancel',
        });
        setVisible(true);
      });
    },
    [settle],
  );

  const alert = useCallback(
    (options: Omit<ConfirmOptions, 'cancelLabel'>) => {
      if (pending.current) settle(false);

      return new Promise<void>((resolve) => {
        pending.current = () => resolve();
        setRequest({
          ...options,
          confirmLabel: options.confirmLabel ?? 'OK',
          cancelLabel: undefined,
        });
        setVisible(true);
      });
    },
    [settle],
  );

  const showError = useCallback(
    (message: string, options?: { title?: string; icon?: string }) =>
      alert({
        title: options?.title ?? 'Something went wrong',
        message,
        icon: options?.icon ?? '⚠️',
        tone: 'danger',
        confirmLabel: 'OK',
      }),
    [alert],
  );

  const value = useMemo(() => ({ confirm, alert, showError }), [confirm, alert, showError]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      {request && (
        <Dialog
          visible={visible}
          title={request.title}
          message={request.message}
          icon={request.icon}
          tone={request.tone}
          confirmLabel={request.confirmLabel}
          cancelLabel={request.cancelLabel}
          dismissible={request.dismissible}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used inside DialogProvider');
  return ctx;
}
