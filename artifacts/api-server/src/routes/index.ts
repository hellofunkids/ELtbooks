import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analyzeRouter from "./analyze";
import ttsRouter from "./tts";
import quizRouter from "./quiz";
import syncRouter from "./sync";
import realtimeSyncRouter from "./realtime-sync";
import essayAnswersRouter from "./essay-answers";
import grammarWorksheetRouter from "./grammar-worksheet";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyzeRouter);
router.use(ttsRouter);
router.use(quizRouter);
router.use(realtimeSyncRouter);
router.use(syncRouter);
router.use(essayAnswersRouter);
router.use(grammarWorksheetRouter);

export default router;
