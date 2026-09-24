# DANSK eSIM backend

Backend scaffold for the Telegram-first platform.

## Architecture
- API: Node.js + TypeScript
- Database: PostgreSQL in production
- Auth: Telegram Mini App init data verification
- Provider adapters: eSIM + verification
- Payments: provider-agnostic manual-payment state machine
- Privacy: data minimization by default

## Security
Never commit Telegram bot tokens, provider API keys, wallet private keys, webhook secrets or other credentials.

## Planned endpoints
- GET /health
- POST /api/auth/telegram
- GET /api/catalog
- POST /api/orders
- GET /api/orders/:id
- POST /api/payments/:id/proof
- GET /api/me
- GET /api/me/esims
- POST /api/esims/:id/topup
- POST /api/esims/:id/delete
- GET /api/verifications/services
- POST /api/verifications
- GET /api/verifications/:id
- POST /api/verifications/:id/refresh
