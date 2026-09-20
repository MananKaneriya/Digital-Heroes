import { describe, expect, it, vi } from "vitest";
import multer from "multer";
import type { Request, Response } from "express";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { AppError } from "../src/lib/errors.js";

function makeResponse(): Response {
  const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

const req = { path: "/api/winners/winner-1/proof", requestId: "req-1" } as unknown as Request;

describe("errorHandler", () => {
  it("translates a Multer LIMIT_FILE_SIZE error into a clean 400 validation response, not a 500", () => {
    const res = makeResponse();
    const oversizedError = new multer.MulterError("LIMIT_FILE_SIZE");

    errorHandler(oversizedError, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "The uploaded file is too large. Maximum size is 5MB." },
    });
  });

  it("still returns 500 for a Multer error that isn't a file-size limit (unchanged behavior)", () => {
    const res = makeResponse();
    const otherMulterError = new multer.MulterError("LIMIT_UNEXPECTED_FILE");

    errorHandler(otherMulterError, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("still returns the AppError's own status/code for a normal application error (unchanged behavior)", () => {
    const res = makeResponse();

    errorHandler(AppError.validation("Only PNG, JPEG, or WEBP images are allowed."), req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Only PNG, JPEG, or WEBP images are allowed.", details: undefined },
    });
  });

  it("still returns a generic 500 for a truly unexpected error (unchanged behavior)", () => {
    const res = makeResponse();

    errorHandler(new Error("boom"), req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
    });
  });
});
