import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config, isAdmin } from "./config.js";

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

declare global {
  namespace Express {
    interface Request {
      telegramUser?: TelegramUser;
      isAdmin?: boolean;
    }
  }
}

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

/**
 * Валидация initData по алгоритму Telegram:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function verifyInitData(initData: string): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(config.botToken).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (computedHash !== hash) return null;

  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > MAX_AUTH_AGE_SECONDS) return null;

  const userJson = params.get("user");
  if (!userJson) return null;

  try {
    return JSON.parse(userJson) as TelegramUser;
  } catch {
    return null;
  }
}

export function telegramAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const initData = req.header("X-Telegram-Init-Data");
  if (!initData) {
    res.status(401).json({ error: "Отсутствует X-Telegram-Init-Data" });
    return;
  }

  const user = verifyInitData(initData);
  if (!user) {
    res.status(401).json({ error: "Не удалось подтвердить подлинность данных Telegram" });
    return;
  }

  req.telegramUser = user;
  req.isAdmin = isAdmin(String(user.id));
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAdmin) {
    res.status(403).json({ error: "Доступно только администратору" });
    return;
  }
  next();
}
