import path from "path";
import express, { type Express } from "express";
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

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(cors());
// نرفع الحد الأقصى لحجم الطلب عشان صور سجل البطولات (Base64) تنحفظ بدون مشاكل
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));

app.use("/api", router);

/* Serve tournament frontend static files in production */
const isProd = process.env.NODE_ENV === "production";
if (isProd) {
  const staticDir = path.resolve(import.meta.dirname, "..", "..", "..", "artifacts", "tournament", "dist", "public");
  app.use(express.static(staticDir));
  /* SPA fallback — any non-API route serves index.html (Express 5 syntax) */
  app.get("/{*path}", (req, res, next) => {
    if (req.url.startsWith("/api/")) return next();
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

export default app;
