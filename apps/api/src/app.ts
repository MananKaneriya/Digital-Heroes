import express from "express";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { requestId } from "./middleware/requestId.js";
import { apiRateLimiter } from "./middleware/rateLimiter.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { subscriptionsRouter } from "./modules/subscriptions/subscriptions.routes.js";
import { postWebhook } from "./modules/subscriptions/subscriptions.controller.js";
import { scoresRouter } from "./modules/scores/scores.routes.js";
import { charitiesRouter } from "./modules/charities/charities.routes.js";
import { donationsRouter } from "./modules/donations/donations.routes.js";
import { drawsRouter } from "./modules/draws/draws.routes.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
      credentials: true,
    }),
  );
  app.use(requestId);
  app.use(pinoHttp({ logger, genReqId: (req) => (req as express.Request).requestId }));
  app.use(apiRateLimiter);

  // Stripe requires the raw request body to verify webhook signatures, so this
  // route is registered with a raw parser before the global JSON parser below.
  app.post("/api/subscriptions/webhook", express.raw({ type: "application/json" }), postWebhook);

  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ success: true, data: { status: "ok", timestamp: new Date().toISOString() } });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/subscriptions", subscriptionsRouter);
  app.use("/api/scores", scoresRouter);
  app.use("/api/charities", charitiesRouter);
  app.use("/api/donations", donationsRouter);
  app.use("/api/draws", drawsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
