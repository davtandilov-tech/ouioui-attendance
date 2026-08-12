import crypto from "node:crypto";
import { Router } from "express";
import { ah } from "./asyncHandler.js";
import { bot } from "./bot.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { dayKey } from "./time.js";

export const remindersRouter = Router();

function checkSecret(req: import("express").Request): boolean {
  if (!config.cronSecret) return false;
  const provided = req.header("X-Cron-Secret") ?? "";
  const expected = config.cronSecret;
  // Разная длина сравниваемых буферов — не совпадает, но без утечки времени сравнения.
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

async function notify(telegramId: string, text: string) {
  try {
    await bot.api.sendMessage(telegramId, text, {
      reply_markup: { inline_keyboard: [[{ text: "Открыть", web_app: { url: config.publicUrl } }]] },
    });
  } catch (err) {
    console.error(`Не удалось отправить напоминание ${telegramId}:`, err);
  }
}

remindersRouter.post(
  "/checkin",
  ah(async (req, res) => {
    if (!checkSecret(req)) {
      res.status(401).json({ error: "Неверный или отсутствующий секрет" });
      return;
    }

    const today = dayKey();
    const employees = await prisma.employee.findMany({
      where: {
        telegramId: { not: null },
        attendances: { none: { day: today, checkInAt: { not: null } } },
      },
    });

    await Promise.all(
      employees.map((e) =>
        notify(e.telegramId!, `${e.fullName}, не забудьте отметить приход на смену сегодня!`)
      )
    );

    res.json({ ok: true, notified: employees.length });
  })
);

remindersRouter.post(
  "/checkout",
  ah(async (req, res) => {
    if (!checkSecret(req)) {
      res.status(401).json({ error: "Неверный или отсутствующий секрет" });
      return;
    }

    // Без привязки к "сегодня": в момент срабатывания в 00:00 календарный день уже
    // переключился, а незакрытая вчерашняя смена — как раз то, о чём нужно напомнить.
    const employees = await prisma.employee.findMany({
      where: {
        telegramId: { not: null },
        attendances: { some: { checkInAt: { not: null }, checkOutAt: null } },
      },
    });

    await Promise.all(
      employees.map((e) =>
        notify(e.telegramId!, `${e.fullName}, не забудьте отметить уход со смены!`)
      )
    );

    res.json({ ok: true, notified: employees.length });
  })
);
