// Small offline-related helpers used across pages.

export const isOnline = (): boolean =>
  typeof navigator !== "undefined" ? navigator.onLine : true;

/**
 * Guard a feature that requires network. Returns true when online; otherwise
 * shows a toast (if `notify` provided) and returns false. Use at the top of
 * bulk-send / outbound communication handlers — these aren't safe to queue
 * because they would result in messages being sent at the wrong time.
 */
export function requireOnline(
  feature: string,
  notify?: { error: (title: string, msg?: any) => void }
): boolean {
  if (isOnline()) return true;
  notify?.error(
    "Internet required",
    `${feature} can't run offline. Reconnect and try again.`
  );
  return false;
}
