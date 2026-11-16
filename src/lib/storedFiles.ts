import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Client documents, invoices and accounting receipts live in a private file
 * store. The database keeps the plain file address; every time a signed-in user
 * opens a file we ask the server for a link that works for one hour.
 * Other addresses (external links, public images) are used as they are.
 */
export function isPrivateFileUrl(stored: string | null | undefined): boolean {
  if (!stored) return false;
  try {
    return new URL(stored).hostname.startsWith("crm-invoice-store.");
  } catch {
    return false;
  }
}

/** Returns a link the browser can open now, or null if the file cannot be opened. */
export async function signedFileUrl(stored: string | null | undefined): Promise<string | null> {
  if (!stored) return null;
  if (!isPrivateFileUrl(stored)) return stored;
  const { data, error } = await supabase.functions.invoke("file-link", { body: { url: stored } });
  if (error || !data?.url) return null;
  return data.url as string;
}

/** Opens a stored file in a new tab using a fresh expiring link. */
export async function openStoredFile(stored: string | null | undefined): Promise<void> {
  if (!isPrivateFileUrl(stored)) {
    if (stored) window.open(stored, "_blank", "noopener,noreferrer");
    return;
  }
  // Open the tab first so pop-up blockers allow it, then point it at the link.
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  const url = await signedFileUrl(stored);
  if (!url) {
    tab?.close();
    return;
  }
  if (tab) tab.location.href = url;
  else window.open(url, "_blank", "noopener,noreferrer");
}

/** React hook: an expiring link for a stored file ("" while it is being made, null if refused). */
export function useSignedFileUrl(stored: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (isPrivateFileUrl(stored) ? "" : stored ?? null));
  useEffect(() => {
    let alive = true;
    if (!isPrivateFileUrl(stored)) {
      setUrl(stored ?? null);
      return;
    }
    setUrl("");
    signedFileUrl(stored).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [stored]);
  return url;
}
