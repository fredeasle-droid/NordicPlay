import crypto from "node:crypto";

export function verifyTelegramInitData(initData: string, botToken: string, maxAgeSeconds = 86400) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheckString = [...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+"="+v).join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (expected.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) return null;
  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now()/1000 - authDate > maxAgeSeconds) return null;
  const userRaw = params.get("user"); if (!userRaw) return null;
  try { const user = JSON.parse(userRaw); return { telegramUserId: String(user.id) }; } catch { return null; }
}
