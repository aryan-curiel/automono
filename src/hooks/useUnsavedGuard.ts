import { useCallback, useEffect, useState } from "react";

/**
 * Tracks whether a form has unsaved edits and reports it up to `App`, which
 * intercepts navigation (sidebar, command palette, back button, window close)
 * to confirm before discarding.
 *
 * `report` must be referentially stable (wrap it in `useCallback`). The form
 * marks itself dirty on any user edit and calls `resetDirty()` right before a
 * successful save so the post-save navigation isn't intercepted — `resetDirty`
 * reports `false` synchronously for that reason.
 */
export function useUnsavedGuard(report: (dirty: boolean) => void) {
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    report(dirty);
  }, [dirty, report]);

  // Clear the guard when the form unmounts (navigation already happened).
  useEffect(() => () => report(false), [report]);

  return {
    dirty,
    markDirty: useCallback(() => setDirty(true), []),
    resetDirty: useCallback(() => {
      setDirty(false);
      report(false);
    }, [report]),
  };
}
