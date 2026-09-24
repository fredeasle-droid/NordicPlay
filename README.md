# DANSK eSIM

Telegram-first eSIM + App Verification platform.

## Current architecture
- Telegram Bot
- Telegram Mini App frontend
- Fastify/TypeScript backend
- Server-side Telegram WebApp authentication
- Provider adapter architecture
- Minimal customer data model
- Admin API scaffold
- No secrets committed

## Production order
1. Connect persistent PostgreSQL database
2. Deploy backend
3. Configure Telegram bot + Mini App URL
4. Build admin UI
5. Connect eSIM provider
6. Connect verification provider
7. Implement compliant payment flow
8. Add subscription renewal/deactivation jobs
9. End-to-end test
