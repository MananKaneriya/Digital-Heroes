import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/** Attaches a request identifier so financial/draw operations can be traced end-to-end (PRD §36). */
export function requestId(req: Request, res: Response, next: NextFunction) {
  req.requestId = randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
}
