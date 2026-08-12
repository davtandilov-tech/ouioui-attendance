import { initData } from "./telegram.js";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const data = initData();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(data ? { "X-Telegram-Init-Data": data } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? "Ошибка запроса");
  }
  return res.json() as Promise<T>;
}

export interface Me {
  linked: boolean;
  isAdmin: boolean;
  employee?: {
    id: number;
    fullName: string;
    position: string;
    workStartTime: string;
    checkInTime: string | null;
    checkOutTime: string | null;
    lateToday: boolean | null;
    workedHours: number | null;
  };
}

export interface UnlinkedEmployee {
  id: number;
  fullName: string;
  position: string;
}

export interface AdminEmployee {
  id: number;
  fullName: string;
  position: string;
  workStartTime: string;
  linked: boolean;
  telegramName: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  lateToday: boolean | null;
  workedHours: number | null;
}

export const api = {
  me: () => request<Me>("/me"),
  unlinkedEmployees: () => request<UnlinkedEmployee[]>("/unlinked-employees"),
  link: (employeeId: number) =>
    request<{ ok: true }>("/link", { method: "POST", body: JSON.stringify({ employeeId }) }),
  checkin: () => request<{ ok: true; checkInTime: string }>("/checkin", { method: "POST" }),
  checkout: () =>
    request<{ ok: true; checkOutTime: string; workedHours: number }>("/checkout", { method: "POST" }),

  adminEmployees: () => request<AdminEmployee[]>("/admin/employees"),
  adminAddEmployee: (data: { fullName: string; position: string; workStartTime: string }) =>
    request<AdminEmployee>("/admin/employees", { method: "POST", body: JSON.stringify(data) }),
  adminUpdateEmployee: (id: number, data: Record<string, unknown>) =>
    request<AdminEmployee>(`/admin/employees/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  adminDeleteEmployee: (id: number) =>
    request<{ ok: true }>(`/admin/employees/${id}`, { method: "DELETE" }),
};

export function reportCsvUrl(from: string, to: string): string {
  return `/api/admin/report?from=${from}&to=${to}&format=csv`;
}
