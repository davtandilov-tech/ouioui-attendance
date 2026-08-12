import { Router } from "express";
import { prisma } from "./db.js";
import { requireAdmin, telegramAuthMiddleware } from "./telegramAuth.js";
import { dayKey, isLate, timeOfDay, workedHours } from "./time.js";

export const router = Router();

router.use(telegramAuthMiddleware);

function serializeAttendance(a: { checkInAt: Date | null; checkOutAt: Date | null }, workStartTime: string) {
  return {
    checkInTime: a.checkInAt ? timeOfDay(a.checkInAt) : null,
    checkOutTime: a.checkOutAt ? timeOfDay(a.checkOutAt) : null,
    lateToday: a.checkInAt ? isLate(a.checkInAt, workStartTime) : null,
    workedHours: a.checkInAt && a.checkOutAt ? workedHours(a.checkInAt, a.checkOutAt) : null,
  };
}

// ---------- Обычный пользователь ----------

router.get("/me", async (req, res) => {
  const telegramId = String(req.telegramUser!.id);
  const employee = await prisma.employee.findUnique({ where: { telegramId } });

  if (!employee) {
    res.json({ linked: false, isAdmin: req.isAdmin });
    return;
  }

  const today = dayKey();
  const attendance = await prisma.attendance.findUnique({
    where: { employeeId_day: { employeeId: employee.id, day: today } },
  });

  res.json({
    linked: true,
    isAdmin: req.isAdmin,
    employee: {
      id: employee.id,
      fullName: employee.fullName,
      position: employee.position,
      workStartTime: employee.workStartTime,
      ...serializeAttendance(attendance ?? { checkInAt: null, checkOutAt: null }, employee.workStartTime),
    },
  });
});

router.get("/unlinked-employees", async (_req, res) => {
  const employees = await prisma.employee.findMany({
    where: { telegramId: null },
    select: { id: true, fullName: true, position: true },
    orderBy: { fullName: "asc" },
  });
  res.json(employees);
});

router.post("/link", async (req, res) => {
  const telegramId = String(req.telegramUser!.id);
  const employeeId = Number(req.body?.employeeId);
  if (!employeeId) {
    res.status(400).json({ error: "employeeId обязателен" });
    return;
  }

  const alreadyLinked = await prisma.employee.findUnique({ where: { telegramId } });
  if (alreadyLinked) {
    res.status(409).json({ error: "Этот Telegram-аккаунт уже привязан к сотруднику" });
    return;
  }

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) {
    res.status(404).json({ error: "Сотрудник не найден" });
    return;
  }
  if (employee.telegramId) {
    res.status(409).json({ error: "Этот сотрудник уже привязан к другому аккаунту" });
    return;
  }

  const telegramName = [req.telegramUser!.first_name, req.telegramUser!.last_name]
    .filter(Boolean)
    .join(" ");

  await prisma.employee.update({
    where: { id: employeeId },
    data: { telegramId, telegramName },
  });

  res.json({ ok: true });
});

router.post("/checkin", async (req, res) => {
  const telegramId = String(req.telegramUser!.id);
  const employee = await prisma.employee.findUnique({ where: { telegramId } });
  if (!employee) {
    res.status(404).json({ error: "Сначала привяжите аккаунт к сотруднику" });
    return;
  }

  const today = dayKey();
  const existing = await prisma.attendance.findUnique({
    where: { employeeId_day: { employeeId: employee.id, day: today } },
  });
  if (existing?.checkInAt) {
    res.status(409).json({ error: "Приход уже отмечен сегодня" });
    return;
  }

  const attendance = await prisma.attendance.upsert({
    where: { employeeId_day: { employeeId: employee.id, day: today } },
    update: { checkInAt: new Date() },
    create: { employeeId: employee.id, day: today, checkInAt: new Date() },
  });

  res.json({ ok: true, checkInTime: timeOfDay(attendance.checkInAt!) });
});

router.post("/checkout", async (req, res) => {
  const telegramId = String(req.telegramUser!.id);
  const employee = await prisma.employee.findUnique({ where: { telegramId } });
  if (!employee) {
    res.status(404).json({ error: "Сначала привяжите аккаунт к сотруднику" });
    return;
  }

  const today = dayKey();
  const existing = await prisma.attendance.findUnique({
    where: { employeeId_day: { employeeId: employee.id, day: today } },
  });
  if (!existing?.checkInAt) {
    res.status(409).json({ error: "Сначала отметьте приход" });
    return;
  }
  if (existing.checkOutAt) {
    res.status(409).json({ error: "Уход уже отмечен сегодня" });
    return;
  }

  const attendance = await prisma.attendance.update({
    where: { employeeId_day: { employeeId: employee.id, day: today } },
    data: { checkOutAt: new Date() },
  });

  res.json({
    ok: true,
    checkOutTime: timeOfDay(attendance.checkOutAt!),
    workedHours: workedHours(attendance.checkInAt!, attendance.checkOutAt!),
  });
});

// ---------- Администратор ----------

const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get("/employees", async (_req, res) => {
  const today = dayKey();
  const employees = await prisma.employee.findMany({
    orderBy: { fullName: "asc" },
    include: { attendances: { where: { day: today } } },
  });

  res.json(
    employees.map((e) => {
      const attendance = e.attendances[0] ?? { checkInAt: null, checkOutAt: null };
      return {
        id: e.id,
        fullName: e.fullName,
        position: e.position,
        workStartTime: e.workStartTime,
        linked: Boolean(e.telegramId),
        telegramName: e.telegramName,
        ...serializeAttendance(attendance, e.workStartTime),
      };
    })
  );
});

adminRouter.post("/employees", async (req, res) => {
  const { fullName, position, workStartTime } = req.body ?? {};
  if (!fullName || !position || !/^\d{2}:\d{2}$/.test(workStartTime ?? "")) {
    res.status(400).json({ error: "Нужны fullName, position и workStartTime в формате HH:MM" });
    return;
  }

  const employee = await prisma.employee.create({
    data: { fullName, position, workStartTime },
  });
  res.status(201).json(employee);
});

adminRouter.patch("/employees/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { fullName, position, workStartTime, unlink } = req.body ?? {};

  if (workStartTime !== undefined && !/^\d{2}:\d{2}$/.test(workStartTime)) {
    res.status(400).json({ error: "workStartTime должен быть в формате HH:MM" });
    return;
  }

  const employee = await prisma.employee.update({
    where: { id },
    data: {
      ...(fullName !== undefined ? { fullName } : {}),
      ...(position !== undefined ? { position } : {}),
      ...(workStartTime !== undefined ? { workStartTime } : {}),
      ...(unlink ? { telegramId: null, telegramName: null } : {}),
    },
  });
  res.json(employee);
});

adminRouter.delete("/employees/:id", async (req, res) => {
  const id = Number(req.params.id);
  await prisma.attendance.deleteMany({ where: { employeeId: id } });
  await prisma.employee.delete({ where: { id } });
  res.json({ ok: true });
});

adminRouter.get("/report", async (req, res) => {
  const from = String(req.query.from ?? dayKey());
  const to = String(req.query.to ?? dayKey());
  const format = req.query.format === "csv" ? "csv" : "json";

  const attendances = await prisma.attendance.findMany({
    where: { day: { gte: from, lte: to } },
    include: { employee: true },
    orderBy: [{ day: "asc" }, { checkInAt: "asc" }],
  });

  const rows = attendances.map((a) => ({
    day: a.day,
    fullName: a.employee.fullName,
    position: a.employee.position,
    workStartTime: a.employee.workStartTime,
    ...serializeAttendance(a, a.employee.workStartTime),
  }));

  if (format === "csv") {
    const header = "Дата,ФИО,Должность,Начало смены,Приход,Уход,Опоздание,Отработано часов";
    const body = rows
      .map((r) =>
        [
          r.day,
          r.fullName,
          r.position,
          r.workStartTime,
          r.checkInTime ?? "",
          r.checkOutTime ?? "",
          r.lateToday ? "да" : "нет",
          r.workedHours ?? "",
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="report-${from}-${to}.csv"`);
    res.send(`﻿${header}\n${body}`);
    return;
  }

  res.json(rows);
});

router.use("/admin", adminRouter);
