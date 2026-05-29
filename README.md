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

The app deploys to Cloudflare Pages via `wrangler pages deploy dist` after `npm run build`.

## Custom Domain

Production URL: https://go.in-sync.co.in
