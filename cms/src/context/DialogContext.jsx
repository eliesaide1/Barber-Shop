import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Dialog from '../components/Dialog.jsx';

const DialogContext = createContext(null);

/**
 * Imperative dialogs, matching the client app's API exactly so the two
 * codebases read the same way:
 *
 *   const { confirm, showError } = useDialog();
 *   if (await confirm({ title: 'Deactivate Karim?', tone: 'danger' })) { … }
 */
export function DialogProvider({ children }) {
  const [request, setRequest] = useState(null);
  /* The resolver lives in a ref and is cleared the instant we settle, so a
     double click during the exit can't resolve the same promise twice and run
     the caller's action twice. */
  const pending = useRef(null);

  const settle = useCallback((value) => {
    const resolve = pending.current;
    if (!resolve) return;
    pending.current = null;
    setRequest(null);
    resolve(value);
  }, []);

  const confirm = useCallback(
    (options) => {
      /* A second dialog over an open one would orphan the first promise. */
      if (pending.current) settle(false);

      return new Promise((resolve) => {
        pending.current = resolve;
        setRequest({
          ...options,
          confirmLabel: options.confirmLabel ?? 'Confirm',
          cancelLabel: options.cancelLabel ?? 'Cancel',
        });
      });
    },
    [settle],
  );

  const alert = useCallback(
    (options) => {
      if (pending.current) settle(false);

      return new Promise((resolve) => {
        pending.current = () => resolve();
        setRequest({ ...options, confirmLabel: options.confirmLabel ?? 'OK', cancelLabel: undefined });
      });
    },
    [settle],
  );

  /**
   * `message` is usually the sentence the API sent back — written to be read by
   * a person, so it carries the detail. `title` says which action failed, and
   * is worth passing every time: "Couldn't save the product" tells you where
   * you stand, "Something went wrong" does not.
   */
  const showError = useCallback(
    (message, options = {}) =>
      alert({
        title: options.title ?? 'Something went wrong',
        message,
        icon: options.icon ?? '⚠️',
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
          {...request}
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
