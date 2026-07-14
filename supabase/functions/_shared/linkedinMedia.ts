/**
 * LinkedIn media upload helpers — images, video, and documents (for carousels)
 * all follow the same two/three-step shape on LinkedIn's REST API:
 *   1. initializeUpload -> get an uploadUrl + asset URN
 *   2. PUT the raw bytes to uploadUrl
 *   3. (video only) finalizeUpload with the returned part ETags
 * The resulting URN is what gets referenced in the post's content.media.
 */

const LINKEDIN_VERSION = '202503';

function authHeaders(token: string) {
  return {
    'Authorization': `Bearer ${token}`,
    'LinkedIn-Version': LINKEDIN_VERSION,
    'Content-Type': 'application/json',
    'X-Restli-Protocol-Version': '2.0.0',
  };
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Failed to fetch media source ${url}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function uploadImageToLinkedIn(token: string, authorUrn: string, imageUrl: string): Promise<string> {
  const initRes = await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ initializeUploadRequest: { owner: authorUrn } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!initRes.ok) throw new Error(`LinkedIn image initializeUpload ${initRes.status}: ${await initRes.text()}`);
  const initData = await initRes.json();
  const uploadUrl: string = initData.value.uploadUrl;
  const imageUrn: string = initData.value.image;

  const bytes = await fetchBytes(imageUrl);
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}` },
    body: bytes,
    signal: AbortSignal.timeout(30_000),
  });
  if (!putRes.ok) throw new Error(`LinkedIn image binary upload ${putRes.status}: ${await putRes.text()}`);

  return imageUrn;
}

export async function uploadVideoToLinkedIn(token: string, authorUrn: string, videoUrl: string): Promise<string> {
  const bytes = await fetchBytes(videoUrl);

  const initRes = await fetch('https://api.linkedin.com/rest/videos?action=initializeUpload', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: authorUrn,
        fileSizeBytes: bytes.length,
        uploadCaptions: false,
        uploadThumbnail: false,
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!initRes.ok) throw new Error(`LinkedIn video initializeUpload ${initRes.status}: ${await initRes.text()}`);
  const initData = await initRes.json();
  const videoUrn: string = initData.value.video;
  const uploadToken: string = initData.value.uploadToken ?? '';
  const instructions: Array<{ uploadUrl: string; firstByte: number; lastByte: number }> = initData.value.uploadInstructions;

  const uploadedPartIds: string[] = [];
  for (const part of instructions) {
    const chunk = bytes.slice(part.firstByte, part.lastByte + 1);
    const putRes = await fetch(part.uploadUrl, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: chunk,
      signal: AbortSignal.timeout(60_000),
    });
    if (!putRes.ok) throw new Error(`LinkedIn video part upload ${putRes.status}: ${await putRes.text()}`);
    const etag = putRes.headers.get('etag') ?? putRes.headers.get('ETag') ?? '';
    uploadedPartIds.push(etag);
  }

  const finalizeRes = await fetch('https://api.linkedin.com/rest/videos?action=finalizeUpload', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      finalizeUploadRequest: { video: videoUrn, uploadToken, uploadedPartIds },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!finalizeRes.ok) throw new Error(`LinkedIn video finalizeUpload ${finalizeRes.status}: ${await finalizeRes.text()}`);

  return videoUrn;
}

export async function uploadDocumentToLinkedIn(token: string, authorUrn: string, pdfBytes: Uint8Array): Promise<string> {
  const initRes = await fetch('https://api.linkedin.com/rest/documents?action=initializeUpload', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ initializeUploadRequest: { owner: authorUrn } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!initRes.ok) throw new Error(`LinkedIn document initializeUpload ${initRes.status}: ${await initRes.text()}`);
  const initData = await initRes.json();
  const uploadUrl: string = initData.value.uploadUrl;
  const documentUrn: string = initData.value.document;

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}` },
    body: pdfBytes,
    signal: AbortSignal.timeout(30_000),
  });
  if (!putRes.ok) throw new Error(`LinkedIn document binary upload ${putRes.status}: ${await putRes.text()}`);

  return documentUrn;
}
