import express from "express";
import { protect }    from "../middleware/auth.js";
import { checkLimit } from "../middleware/checkLimit.js";  // ← NEW
import {
  getTaskStatuses,
  getTaskStatus,
  createTaskStatus,
  updateTaskStatus,
  deleteTaskStatus,
} from "../controllers/taskStatusController.js";

const router = express.Router();

// ── GET ────────────────────────────────────────────────────────────────────────
router.get("/",    protect, getTaskStatuses);
router.get("/:id", protect, getTaskStatus);

// ── POST ───────────────────────────────────────────────────────────────────────
// ✅ checkLimit("taskStatuses") blocks creation when plan limit is reached
router.post("/", protect, checkLimit("taskStatuses"), createTaskStatus);

// ── PUT / DELETE (no limit needed) ────────────────────────────────────────────
router.put("/:id",    protect, updateTaskStatus);
router.delete("/:id", protect, deleteTaskStatus);

export default router;