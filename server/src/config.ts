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
  publicUrl: required("PUBLIC_URL"),
  timezone: process.env.TIMEZONE || "Europe/Moscow",
  port: Number(process.env.PORT) || 3000,
};

export function isAdmin(telegramId: string): boolean {
  return config.adminTelegramIds.has(telegramId);
}
