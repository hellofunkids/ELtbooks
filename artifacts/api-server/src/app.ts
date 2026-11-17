import express, { type Express } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

app.use("/api", router);

// Single-service hosting: serve the built web app from the same origin, so /api, SSE and
// /api/sync/assets need no extra proxy. Skipped when the build is absent (e.g. API-only dev).
const staticDir = process.env.STATIC_DIR
  ? path.resolve(process.env.STATIC_DIR)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../elt-analyzer/dist/public");
if (existsSync(path.join(staticDir, "index.html"))) {
  app.use(express.static(staticDir, {
    index: false,
    setHeaders(res, file) {
      res.setHeader("Cache-Control", file.includes(`${path.sep}assets${path.sep}`)
        ? "public, max-age=31536000, immutable" : "no-cache");
    },
  }));
  app.use((req, res, next) => {
    if ((req.method !== "GET" && req.method !== "HEAD") || req.path.startsWith("/api")) { next(); return; }
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(staticDir, "index.html"));
  });
  logger.info({ staticDir }, "Serving web app");
}

export default app;
