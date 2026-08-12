import { config } from "./config.js";

/** Календарный день в часовом поясе компании, формат YYYY-MM-DD */
export function dayKey(date: Date = new Date()): string {
  return date.toLocaleDateString("sv-SE", { timeZone: config.timezone });
}

/** Время HH:MM в часовом поясе компании */
export function timeOfDay(date: Date): string {
  return date.toLocaleTimeString("sv-SE", {
    timeZone: config.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Разбирает время начала смены из ввода вида "9:00", "09-00", "09.00" в канонический "09:00" */
export function normalizeTimeInput(raw: string): string | null {
  const match = raw.trim().match(/^(\d{1,2})[:\-.\s](\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Опоздал ли сотрудник: сравнение локального времени отметки с плановым временем начала (HH:MM) */
export function isLate(checkInAt: Date, workStartTime: string | null): boolean | null {
  if (!workStartTime) return null;
  return timeOfDay(checkInAt) > workStartTime;
}

/** Отработанные часы между приходом и уходом, округлённые до сотых */
export function workedHours(checkInAt: Date, checkOutAt: Date): number {
  const ms = checkOutAt.getTime() - checkInAt.getTime();
  return Math.round((ms / 1000 / 60 / 60) * 100) / 100;
}
