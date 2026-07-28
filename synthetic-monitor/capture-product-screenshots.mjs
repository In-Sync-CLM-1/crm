// One-off/periodic capture of REAL product screenshots for the LinkedIn
// "product showcase" post format (mkt-blog-writer). Navigates to each active
// product's live marketing URL, screenshots the rendered page, and uploads
// to the crm-marketing-assets R2 bucket via its Worker — same upload path
// _shared/r2Marketing.ts uses from the edge function side.
//
// Usage: node capture-product-screenshots.mjs
// Reads SUPABASE_PROJECT_REF/SUPABASE_ACCESS_TOKEN and R2_MARKETING_WORKER_URL/
// R2_MARKETING_UPLOAD_SECRET from ../.env.

import { readFileSync } from 'fs';
import { chromium } from 'playwright';

const envPath = new URL('../.env', import.meta.url);
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const { SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN, R2_MARKETING_WORKER_URL, R2_MARKETING_UPLOAD_SECRET } = env;

async function fetchProducts() {
  const sql = `select product_key, product_url from mkt_products where active = true order by product_key;`;
  const res = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`, 'User-Agent': 'curl/8' },
    body: JSON.stringify({ query: sql }),
  });
  return res.json();
}

async function uploadToMarketingR2(key, bytes, contentType) {
  const res = await fetch(`${R2_MARKETING_WORKER_URL}/upload?key=${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'x-upload-secret': R2_MARKETING_UPLOAD_SECRET, 'content-type': contentType },
    body: bytes,
  });
  if (!res.ok) throw new Error(`R2 upload failed ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.url;
}

async function main() {
  const products = await fetchProducts();
  if (!Array.isArray(products)) {
    console.error('Failed to load products:', products);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const results = [];

  for (const { product_key, product_url } of products) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    try {
      console.log(`[${product_key}] loading ${product_url}`);
      await page.goto(product_url, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(1500); // let hero animations/lazy images settle
      const bytes = await page.screenshot({ type: 'jpeg', quality: 90 });
      const url = await uploadToMarketingR2(`product-screenshots/${product_key}.jpg`, bytes, 'image/jpeg');
      console.log(`[${product_key}] uploaded -> ${url}`);
      results.push({ product_key, url, ok: true });
    } catch (e) {
      console.warn(`[${product_key}] FAILED: ${e.message}`);
      results.push({ product_key, ok: false, error: e.message });
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log('\nSummary:', JSON.stringify(results, null, 2));
}

main();
