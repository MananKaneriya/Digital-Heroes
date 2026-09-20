import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ErrorCodes } from "@digital-heroes/shared";
import { AppError } from "../lib/errors.js";
import { categoryLogger } from "../lib/logger.js";

const errorLog = categoryLogger("error");

/** Central error handler. Never leaks stack traces, DB errors, or internals to the client (PRD §18, §23). */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  // Multer rejects an oversized upload (charity media, winner proof, ...) by calling
  // next(err) with a MulterError before the request ever reaches a controller/service —
  // without this, it would fall through to the generic 500 branch below instead of the
  // clean 400 every other validation failure gets.
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    res.status(400).json({
      success: false,
      error: { code: ErrorCodes.VALIDATION_ERROR, message: "The uploaded file is too large. Maximum size is 5MB." },
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.status >= 500) {
      errorLog.error({ err, requestId: req.requestId, path: req.path }, err.message);
    }
    res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  errorLog.error({ err, requestId: req.requestId, path: req.path }, "unhandled error");
  res.status(500).json({
    success: false,
    error: { code: ErrorCodes.INTERNAL_ERROR, message: "An unexpected error occurred." },
  });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: { code: ErrorCodes.NOT_FOUND, message: `No route matches ${req.method} ${req.path}` },
  });
}
