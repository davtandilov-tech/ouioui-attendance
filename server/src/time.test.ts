import assert from "node:assert/strict";
import { test } from "node:test";
import { dayKey, isLate, normalizeTimeInput, workedHours } from "./time.js";

test("normalizeTimeInput принимает разные разделители", () => {
  assert.equal(normalizeTimeInput("09:00"), "09:00");
  assert.equal(normalizeTimeInput("09-00"), "09:00");
  assert.equal(normalizeTimeInput("09.00"), "09:00");
  assert.equal(normalizeTimeInput("09 00"), "09:00");
  assert.equal(normalizeTimeInput("9:00"), "09:00");
  assert.equal(normalizeTimeInput("  14:30  "), "14:30");
});

test("normalizeTimeInput отклоняет некорректный ввод", () => {
  assert.equal(normalizeTimeInput(""), null);
  assert.equal(normalizeTimeInput("не время"), null);
  assert.equal(normalizeTimeInput("24:00"), null);
  assert.equal(normalizeTimeInput("09:60"), null);
  assert.equal(normalizeTimeInput("9"), null);
  assert.equal(normalizeTimeInput("09:0"), null);
});

test("isLate возвращает null без заданного workStartTime", () => {
  assert.equal(isLate(new Date(), null), null);
});

test("isLate сравнивает время прихода по часовому поясу компании (Europe/Moscow, UTC+3)", () => {
  // 06:30 UTC = 09:30 по Москве
  const checkInAt = new Date("2026-01-15T06:30:00Z");
  assert.equal(isLate(checkInAt, "09:00"), true);
  assert.equal(isLate(checkInAt, "09:30"), false);
  assert.equal(isLate(checkInAt, "10:00"), false);
});

test("dayKey учитывает переход через полночь по Москве, а не по UTC", () => {
  // 21:30 UTC 15 января = 00:30 по Москве 16 января — уже следующий день
  const beforeMidnightUtc = new Date("2026-01-15T20:30:00Z");
  const afterMidnightMoscow = new Date("2026-01-15T21:30:00Z");
  assert.equal(dayKey(beforeMidnightUtc), "2026-01-15");
  assert.equal(dayKey(afterMidnightMoscow), "2026-01-16");
});

test("workedHours считает разницу в часах с округлением до сотых", () => {
  const checkInAt = new Date("2026-01-15T09:00:00Z");
  const checkOutAt = new Date("2026-01-15T17:30:00Z");
  assert.equal(workedHours(checkInAt, checkOutAt), 8.5);
});
