/**
 * Uploads/deletes a file in the crm-files R2 bucket via its Worker
 * (r2-files-worker/), returning a public URL. Same pattern as the
 * existing invoice/marketing R2 workers.
 */
export async function uploadToFilesR2(key: string, bytes: BodyInit, contentType: string): Promise<string> {
  const workerUrl = Deno.env.get('R2_FILES_WORKER_URL')!;
  const secret = Deno.env.get('R2_FILES_UPLOAD_SECRET')!;

  const res = await fetch(`${workerUrl}/upload?key=${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'x-upload-secret': secret, 'content-type': contentType },
    body: bytes,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`R2 files upload failed ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.url as string;
}

export async function deleteFromFilesR2(key: string): Promise<void> {
  const workerUrl = Deno.env.get('R2_FILES_WORKER_URL')!;
  const secret = Deno.env.get('R2_FILES_UPLOAD_SECRET')!;

  const res = await fetch(`${workerUrl}/${key}`, {
    method: 'DELETE',
    headers: { 'x-upload-secret': secret },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`R2 files delete failed ${res.status}: ${await res.text()}`);
}

export async function downloadFromFilesR2(key: string): Promise<Response> {
  const workerUrl = Deno.env.get('R2_FILES_WORKER_URL')!;
  const res = await fetch(`${workerUrl}/${key}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`R2 files download failed ${res.status}: ${await res.text()}`);
  return res;
}
