import { bot } from "./bot.js";
import { config } from "./config.js";

export async function notifyAdmins(text: string): Promise<void> {
  await Promise.all(
    [...config.adminTelegramIds].map(async (id) => {
      try {
        await bot.api.sendMessage(id, text);
      } catch (err) {
        console.error(`Не удалось уведомить админа ${id}:`, err);
      }
    })
  );
}
