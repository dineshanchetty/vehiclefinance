# vehiclefinance

WhatsApp-based vehicle finance origination and fulfilment platform. Supabase backend, React portal, WhatsApp Cloud API integration.

## Overview

This monorepo contains all services for the vehiclefinance platform:

| Package | Description |
|---------|-------------|
| `packages/api` | Supabase Edge Functions and database migrations |
| `packages/web` | React internal portal (Vite + React + TailwindCSS) |
| `packages/bot` | WhatsApp bot handler logic (WhatsApp Cloud API) |
| `packages/shared` | Shared types, constants, and utilities |

## Getting Started

### Prerequisites
- Node.js 18+
- pnpm (workspace manager)
- Supabase CLI
- GitHub CLI (`gh`)

### Install dependencies
```bash
pnpm install
```

### Environment setup
Copy `.env.example` to `.env` in each package and fill in the required values.

## Architecture

- **WhatsApp Cloud API** — inbound/outbound messaging for borrower flows
- **Supabase** — Postgres database, auth, storage, and Edge Functions
- **React Portal** — internal tool for loan officers and ops team
- **Shared package** — TypeScript types and utilities shared across packages

## Docs

See the `docs/` directory for solution design documents.
