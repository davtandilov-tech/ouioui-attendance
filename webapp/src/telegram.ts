interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
  themeParams: Record<string, string>;
  isVersionAtLeast: (version: string) => boolean;
  showConfirm: (message: string, callback: (ok: boolean) => void) => void;
  showAlert: (message: string, callback?: () => void) => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export const tg = window.Telegram?.WebApp ?? null;

export function initData(): string | null {
  if (tg && tg.initData) return tg.initData;
  // Только для локальной разработки вне Telegram: сервер всё равно проверяет подпись.
  if (import.meta.env.DEV) {
    return new URLSearchParams(window.location.search).get("dev_init_data");
  }
  return null;
}

// showConfirm/showAlert появились в Bot API 6.2 — в старых клиентах Telegram
// откатываемся на нативные confirm/alert, которые в WebView тоже работают.
const supportsPopups = () => {
  try {
    return Boolean(tg?.isVersionAtLeast("6.2"));
  } catch {
    return false;
  }
};

export function confirmDialog(message: string): Promise<boolean> {
  if (supportsPopups()) {
    return new Promise((resolve) => tg!.showConfirm(message, resolve));
  }
  return Promise.resolve(window.confirm(message));
}

export function alertDialog(message: string): Promise<void> {
  if (supportsPopups()) {
    return new Promise((resolve) => tg!.showAlert(message, () => resolve()));
  }
  window.alert(message);
  return Promise.resolve();
}
