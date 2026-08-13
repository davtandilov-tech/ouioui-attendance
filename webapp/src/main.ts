import { api, reportCsvUrl, type AdminEmployee, type UnlinkedEmployee } from "./api.js";
import { alertDialog, confirmDialog, initData, tg } from "./telegram.js";

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

const app = document.getElementById("app")!;
const LOGO = `<img src="/logo.png" class="logo" alt="Oui Oui" />`;

tg?.ready();
tg?.expand();

async function boot() {
  if (!initData()) {
    app.innerHTML = `${LOGO}<p class="error">Откройте это приложение через кнопку в Telegram-боте.</p>`;
    return;
  }

  try {
    const me = await api.me();
    if (me.isAdmin) {
      // Админ может не быть сотрудником (например, управляющий без смен) —
      // пускаем его в панель напрямую, минуя обязательную привязку.
      await renderMainScreen(true, me.linked ? "me" : "admin");
    } else if (me.linked) {
      await renderMainScreen(false, "me");
    } else {
      await renderLinkScreen();
    }
  } catch (e) {
    app.innerHTML = `<p class="error">${(e as Error).message}</p>`;
  }
}

async function renderLinkScreen() {
  app.innerHTML = `${LOGO}<h1>Кто вы?</h1><p>Выберите себя в списке, чтобы привязать аккаунт.</p><div class="card" id="list"></div>`;
  await renderUnlinkedList(document.getElementById("list")!);
}

async function renderUnlinkedList(container: HTMLElement) {
  const employees = await api.unlinkedEmployees();

  if (employees.length === 0) {
    container.innerHTML = `<p>Список сотрудников пуст. Обратитесь к администратору.</p>`;
    return;
  }

  container.innerHTML = "";
  for (const emp of employees) {
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `<div>${escapeHtml(emp.fullName)}<div class="status">${escapeHtml(emp.position)}</div></div>`;
    item.onclick = () => renderLinkForm(container, emp);
    container.appendChild(item);
  }
}

function renderLinkForm(container: HTMLElement, emp: UnlinkedEmployee) {
  container.innerHTML = `
    <p>Это вы — <strong>${escapeHtml(emp.fullName)}</strong>?</p>
    <p>Укажите время начала вашей смены:</p>
    <input id="link-time" placeholder="Например, 09:00" />
    <button class="button" id="link-confirm">Подтвердить</button>
    <button class="button secondary" id="link-cancel">Назад</button>
    <div class="error" id="link-error"></div>
  `;

  document.getElementById("link-cancel")!.addEventListener("click", () => {
    renderUnlinkedList(container);
  });

  document.getElementById("link-confirm")!.addEventListener("click", async () => {
    const workStartTime = (document.getElementById("link-time") as HTMLInputElement).value.trim();
    const errorEl = document.getElementById("link-error")!;
    errorEl.textContent = "";

    if (!workStartTime) {
      errorEl.textContent = "Укажите время начала смены";
      return;
    }

    try {
      await api.link(emp.id, workStartTime);
      await boot();
    } catch (e) {
      errorEl.textContent = (e as Error).message;
    }
  });
}

async function renderMainScreen(isAdmin: boolean, tab: "me" | "admin" = "me") {
  const tabs = isAdmin
    ? `<div class="tabs">
         <button data-tab="me" class="${tab === "me" ? "active" : ""}">Я</button>
         <button data-tab="admin" class="${tab === "admin" ? "active" : ""}">Админ</button>
       </div>`
    : "";

  app.innerHTML = `${LOGO}${tabs}<div id="content"></div>`;

  if (isAdmin) {
    app.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((btn) => {
      btn.onclick = () => renderMainScreen(isAdmin, btn.dataset.tab as "me" | "admin");
    });
  }

  if (tab === "admin") {
    await renderAdminContent();
  } else {
    await renderMeContent();
  }
}

async function renderMeContent() {
  const content = document.getElementById("content")!;
  const me = await api.me();

  if (!me.linked) {
    content.innerHTML = `<p>Вы ещё не привязаны как сотрудник. Выберите себя в списке:</p><div class="card" id="list"></div>`;
    await renderUnlinkedList(document.getElementById("list")!);
    return;
  }

  const e = me.employee!;

  content.innerHTML = `
    <div class="card">
      <div>${escapeHtml(e.fullName)}</div>
      <div class="status">${escapeHtml(e.position)} · начало смены ${e.workStartTime ?? "не указано"}</div>
      ${e.checkInTime ? `<div class="status ${e.lateToday ? "late" : "ok"}">Приход: ${e.checkInTime}${e.lateToday ? " (опоздание)" : ""}</div>` : ""}
      ${e.checkOutTime ? `<div class="status">Уход: ${e.checkOutTime}</div>` : ""}
      ${e.workedHours != null ? `<div class="status">Отработано часов: ${e.workedHours}</div>` : ""}
      <button class="button" id="checkin" ${e.checkInTime ? "disabled" : ""}>Я на работе</button>
      <button class="button secondary" id="checkout" ${!e.checkInTime || e.checkOutTime ? "disabled" : ""}>Ухожу с работы</button>
    </div>
  `;

  document.getElementById("checkin")!.addEventListener("click", async () => {
    try {
      await api.checkin();
      await renderMeContent();
    } catch (err) {
      await alertDialog((err as Error).message);
    }
  });

  document.getElementById("checkout")!.addEventListener("click", async () => {
    try {
      await api.checkout();
      await renderMeContent();
    } catch (err) {
      await alertDialog((err as Error).message);
    }
  });
}

async function renderAdminContent() {
  const content = document.getElementById("content")!;
  const employees = await api.adminEmployees();

  content.innerHTML = `
    <h2>Сегодня</h2>
    <div class="card"><table id="today-table"></table></div>

    <h2>Добавить сотрудника</h2>
    <div class="card">
      <input id="new-name" placeholder="ФИО" />
      <input id="new-position" placeholder="Должность" />
      <input id="new-start" placeholder="Начало смены (необязательно — укажет сотрудник сам)" />
      <button class="button" id="add-btn">Добавить</button>
      <div class="error" id="add-error"></div>
    </div>

    <h2>Отчёт</h2>
    <div class="card">
      <input id="report-from" type="date" />
      <input id="report-to" type="date" />
      <button class="button secondary" id="report-btn">Скачать CSV</button>
    </div>
  `;

  renderEmployeeTable(employees);

  document.getElementById("add-btn")!.addEventListener("click", async () => {
    const fullName = (document.getElementById("new-name") as HTMLInputElement).value.trim();
    const position = (document.getElementById("new-position") as HTMLInputElement).value.trim();
    const workStartTime = (document.getElementById("new-start") as HTMLInputElement).value.trim();
    const errorEl = document.getElementById("add-error")!;
    errorEl.textContent = "";

    try {
      await api.adminAddEmployee({ fullName, position, ...(workStartTime ? { workStartTime } : {}) });
      await renderAdminContent();
    } catch (e) {
      errorEl.textContent = (e as Error).message;
    }
  });

  document.getElementById("report-btn")!.addEventListener("click", async () => {
    const from = (document.getElementById("report-from") as HTMLInputElement).value;
    const to = (document.getElementById("report-to") as HTMLInputElement).value;
    if (!from || !to) {
      await alertDialog("Укажите обе даты");
      return;
    }
    const res = await fetch(reportCsvUrl(from, to), {
      headers: { "X-Telegram-Init-Data": initData()! },
    });
    if (!res.ok) {
      await alertDialog("Не удалось получить отчёт");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

function renderEmployeeTable(employees: AdminEmployee[]) {
  const table = document.getElementById("today-table")!;
  table.innerHTML = `
    <tr><th>ФИО</th><th>Приход</th><th>Уход</th><th>Часы</th><th></th></tr>
    ${employees
      .map(
        (e) => `
      <tr data-row="${e.id}">
        <td>${escapeHtml(e.fullName)}${e.linked ? "" : " <span class=\"status\">(не привязан)</span>"}</td>
        <td class="${e.lateToday ? "late" : ""}">${e.checkInTime ?? "—"}</td>
        <td>${e.checkOutTime ?? "—"}</td>
        <td>${e.workedHours ?? "—"}</td>
        <td><a href="#" data-edit="${e.id}">изменить</a> · <a href="#" data-delete="${e.id}">удалить</a></td>
      </tr>`
      )
      .join("")}
  `;

  table.querySelectorAll<HTMLAnchorElement>("[data-edit]").forEach((link) => {
    link.onclick = (ev) => {
      ev.preventDefault();
      const id = Number(link.dataset.edit);
      const employee = employees.find((e) => e.id === id);
      if (employee) renderEditRow(employee);
    };
  });

  table.querySelectorAll<HTMLAnchorElement>("[data-delete]").forEach((link) => {
    link.onclick = async (ev) => {
      ev.preventDefault();
      const id = Number(link.dataset.delete);
      const employee = employees.find((e) => e.id === id);
      if (!employee || !(await confirmDialog(`Удалить сотрудника ${employee.fullName}?`))) return;
      await api.adminDeleteEmployee(id);
      await renderAdminContent();
    };
  });
}

function renderEditRow(e: AdminEmployee) {
  const row = document.querySelector<HTMLTableRowElement>(`tr[data-row="${e.id}"]`);
  if (!row) return;

  row.innerHTML = `
    <td colspan="4">
      <input id="edit-name" value="${escapeHtml(e.fullName)}" placeholder="ФИО" />
      <input id="edit-position" value="${escapeHtml(e.position)}" placeholder="Должность" />
      <input id="edit-time" value="${e.workStartTime ? escapeHtml(e.workStartTime) : ""}" placeholder="Начало смены, напр. 09:00" />
      <div class="error" id="edit-error"></div>
    </td>
    <td>
      <a href="#" id="edit-save">сохранить</a> · <a href="#" id="edit-cancel">отмена</a>
      ${e.linked ? ` · <a href="#" id="edit-unlink">отвязать</a>` : ""}
    </td>
  `;

  document.getElementById("edit-cancel")!.addEventListener("click", (ev) => {
    ev.preventDefault();
    renderAdminContent();
  });

  document.getElementById("edit-save")!.addEventListener("click", async (ev) => {
    ev.preventDefault();
    const fullName = (document.getElementById("edit-name") as HTMLInputElement).value.trim();
    const position = (document.getElementById("edit-position") as HTMLInputElement).value.trim();
    const workStartTime = (document.getElementById("edit-time") as HTMLInputElement).value.trim();
    const errorEl = document.getElementById("edit-error")!;
    errorEl.textContent = "";

    if (!fullName || !position) {
      errorEl.textContent = "ФИО и должность обязательны";
      return;
    }

    try {
      await api.adminUpdateEmployee(e.id, {
        fullName,
        position,
        ...(workStartTime ? { workStartTime } : {}),
      });
      await renderAdminContent();
    } catch (err) {
      errorEl.textContent = (err as Error).message;
    }
  });

  const unlinkLink = document.getElementById("edit-unlink");
  unlinkLink?.addEventListener("click", async (ev) => {
    ev.preventDefault();
    if (!(await confirmDialog(`Отвязать Telegram-аккаунт от ${e.fullName}?`))) return;
    await api.adminUpdateEmployee(e.id, { unlink: true });
    await renderAdminContent();
  });
}

boot();
