import Fastify from "fastify";
import cors from "@fastify/cors";
import "dotenv/config";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

app.get("/health", async () => ({ ok: true, service: "dansk-esim-api", version: "0.1.0" }));

app.get("/api/catalog", async () => ({
  esim: {
    sms: [
      { id: "sms_1", label: "Med SMS · 1 nummer", monthlyPrice: 500 },
      { id: "sms_2", label: "Med SMS · 2 numre", monthlyPrice: 800 },
      { id: "sms_3", label: "Med SMS · 3 numre", monthlyPrice: 1100 }
    ],
    voiceOnly: { status: "pricing_pending", minutePackages: [] },
    delivery: { standardFee: 0, expressFee: null, channels: ["telegram", "email"] }
  },
  verification: {
    services: ["WhatsApp", "Telegram", "Instagram", "TikTok", "Facebook", "Google"],
    countries: [{ code: "DK", dialCode: "+45", name: "Danmark" }],
    creditPackages: [3, 10, 25, 50, 100],
    creditExpiry: "never"
  }
}));

app.post("/api/auth/telegram", async (request, reply) => {
  // TODO: verify Telegram WebApp initData server-side before creating a session.
  return reply.code(501).send({ ok: false, error: "telegram_auth_not_configured" });
});

app.post("/api/orders", async (request, reply) => {
  // TODO: validate product, price from server-side catalog, delivery and create order.
  return reply.code(501).send({ ok: false, error: "orders_not_configured" });
});

app.get("/api/me", async (_request, reply) => {
  // TODO: authenticated request only; return minimal customer state.
  return reply.code(501).send({ ok: false, error: "auth_not_configured" });
});

app.post("/api/esims/:id/delete", async (_request, reply) => {
  // TODO: provider deactivation first, then minimize/delete local customer data.
  return reply.code(501).send({ ok: false, error: "esim_deletion_not_configured" });
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
