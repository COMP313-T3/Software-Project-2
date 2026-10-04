import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { requestId } from "./middleware/requestId.js";
import { apiRoutes } from "./routes/index.js";

const BODY_LIMIT = "100kb";

/**
 * Builds the Express app without starting it, so tests can use it directly.
 *
 * @param {{ clientOrigins: string[] }} options Browser origins allowed to call the API with cookies.
 * @returns {import("express").Express} The configured app.
 */
export function createApp({ clientOrigins }) {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestId);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        callback(null, !origin || clientOrigins.includes(origin));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: BODY_LIMIT }));

  app.use("/api", apiRoutes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
