import { Bot, InlineKeyboard } from "grammy";
import "dotenv/config";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");

const bot = new Bot(token);
const miniAppUrl = process.env.MINI_APP_URL;

bot.command("start", async (ctx) => {
  const keyboard = new InlineKeyboard();
  if (miniAppUrl) keyboard.webApp("Åbn DANSK eSIM", miniAppUrl);
  keyboard.row().text("📦 Mine ordrer", "orders").text("📱 Mit nummer", "number");
  keyboard.row().text("💳 Credits", "credits").text("💬 Support", "support");
  await ctx.reply("🇩🇰 *DANSK eSIM*\\n\\nVælg, hvad du vil gøre:", {
    parse_mode: "Markdown",
    reply_markup: keyboard
  });
});

bot.command("menu", (ctx) => ctx.reply("Åbn menuen med /start."));
bot.command("orders", (ctx) => ctx.reply("Dine ordrer hentes fra backend, når API'et er forbundet."));
bot.command("number", (ctx) => ctx.reply("Dit aktive nummer vises her, når eSIM-provider er forbundet."));
bot.command("credits", (ctx) => ctx.reply("Din credits-saldo hentes fra backend, når kontoen er forbundet."));
bot.command("support", (ctx) => ctx.reply("Support-flow kommer her."));

bot.callbackQuery("orders", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply("Ordrehistorik åbnes i Mini App."); });
bot.callbackQuery("number", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply("Mit nummer åbnes i Mini App."); });
bot.callbackQuery("credits", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply("Credits åbnes i Mini App."); });
bot.callbackQuery("support", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply("Support-flow kommer her."); });

bot.catch((err) => console.error("Bot error", err));
await bot.start();
