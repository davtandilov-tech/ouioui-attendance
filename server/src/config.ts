import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Не задана переменная окружения ${name} (см. .env.example)`);
  }
  return value;
}

export const config = {
  botToken: required("BOT_TOKEN"),
  adminTelegramIds: new Set(
    required("ADMIN_TELEGRAM_IDS")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  ),
  // На Render этот адрес доступен автоматически через RENDER_EXTERNAL_URL;
  // на своём сервере/локально указывается явно через PUBLIC_URL.
  publicUrl: process.env.PUBLIC_URL || required("RENDER_EXTERNAL_URL"),
  timezone: process.env.TIMEZONE || "Europe/Moscow",
  port: Number(process.env.PORT) || 3000,
  // Секрет для внешнего cron-триггера напоминаний (см. /internal/reminders/*).
  // Опционален: если не задан, эндпоинты напоминаний отключены, остальное приложение работает как обычно.
  cronSecret: process.env.CRON_SECRET || null,
};

export function isAdmin(telegramId: string): boolean {
  return config.adminTelegramIds.has(telegramId);
}
