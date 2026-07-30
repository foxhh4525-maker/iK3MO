import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tournamentRouter from "./tournament";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/tournament", tournamentRouter);

export default router;
