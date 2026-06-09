# In-Sync CRM

A comprehensive CRM application for managing contacts, clients, campaigns, invoicing, and more.

## Tech Stack

- **Frontend:** Vite + React + TypeScript + Tailwind CSS + shadcn-ui
- **Backend:** Supabase (PostgreSQL + Edge Functions + Auth + Storage)
- **Hosting:** Cloudflare Pages
- **AI:** Gemini API (document extraction, campaign analysis, pipeline insights)
- **Integrations:** Exotel (calling), Resend (email), Razorpay (payments), WhatsApp

## Development

```sh
# Install dependencies
npm install

# Start dev server
npm run dev
```

## Deployment

The frontend deploys to Cloudflare Pages automatically on every push to `main` via `.github/workflows/pages-deploy.yml`; the backend (migrations + edge functions) deploys via `.github/workflows/supabase-deploy.yml` on the same push. Pushing to `main` is the only deploy path — no manual Wrangler or Supabase CLI step.

## Custom Domain

Production URL: https://go.in-sync.co.in
