import express from "express";
import { getAuditLogs, getAuditStats } from "../controllers/auditController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Only Owner + SuperAdmin (enforced inside controller)
router.get("/",      protect, getAuditLogs);
router.get("/stats", protect, getAuditStats);

export default router;