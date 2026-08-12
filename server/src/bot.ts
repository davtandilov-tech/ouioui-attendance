import { Bot } from "grammy";
import { config, isAdmin } from "./config.js";

export const bot = new Bot(config.botToken);

bot.command("start", async (ctx) => {
  const telegramId = String(ctx.from?.id);
  const greeting = isAdmin(telegramId)
    ? "Вы вошли как администратор. Откройте приложение, чтобы отмечать приход/уход и смотреть отчёты."
    : "Откройте приложение, чтобы отметить приход и уход с работы.";

  await ctx.reply(greeting, {
    reply_markup: {
      inline_keyboard: [[{ text: "Открыть", web_app: { url: config.publicUrl } }]],
    },
  });
});

bot.catch((err) => {
  console.error("Ошибка бота:", err);
});
