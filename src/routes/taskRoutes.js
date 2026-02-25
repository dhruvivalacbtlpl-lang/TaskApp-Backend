// routes/taskRoutes.js
import express from "express";
import {
  getTasks, getTaskById, createTask, updateTask, deleteTask,
  getIssues, createIssue, updateIssue,
} from "../controllers/taskController.js";
import { upload } from "../middleware/upload.js"; // ✅ use your existing multer config

const router = express.Router();

// ── ISSUES — must be defined BEFORE /:id to avoid route collision ─────────────
router.get("/issues/all", getIssues);
router.post("/issues/create", upload.array("media", 10), createIssue);
router.put("/issues/:id", upload.array("media", 10), updateIssue);

// ── TASKS ─────────────────────────────────────────────────────────────────────
router.get("/", getTasks);
router.post("/", upload.array("media", 10), createTask); // ✅ multer now processes req.files
router.put("/:id", upload.array("media", 10), updateTask);
router.delete("/:id", deleteTask);
router.get("/:id", getTaskById);

export default router;
