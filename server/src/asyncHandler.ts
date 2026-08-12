import type { NextFunction, Request, RequestHandler, Response } from "express";

// Express 4 не ловит отклонённые промисы из async-хендлеров сами — без этой обёртки
// любая ошибка (например, обрыв связи с БД) валит весь процесс, а не только один запрос.
export function ah(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}
