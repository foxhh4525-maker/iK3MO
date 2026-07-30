import { Router, type IRouter } from "express";
// load zod helpers at runtime to avoid build-order type issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { HealthCheckResponse }: any = require("@workspace/api-zod");

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
