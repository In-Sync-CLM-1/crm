/**
 * Uploads a file to the crm-marketing-assets R2 bucket via its Worker
 * (r2-marketing-worker/), returning a public URL. Same pattern as the
 * existing invoice R2 worker.
 */
export async function uploadToMarketingR2(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const workerUrl = Deno.env.get('R2_MARKETING_WORKER_URL')!;
  const secret = Deno.env.get('R2_MARKETING_UPLOAD_SECRET')!;

  const res = await fetch(`${workerUrl}/upload?key=${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'x-upload-secret': secret, 'content-type': contentType },
    body: bytes,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`R2 marketing upload failed ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.url as string;
}
