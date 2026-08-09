import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tournamentRouter from "./tournament";
import moderatorsRouter from "./moderators";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/tournament", tournamentRouter);
router.use("/moderators", moderatorsRouter);

export default router;