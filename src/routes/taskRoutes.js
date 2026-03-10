// routes/taskRoutes.js
import express from "express";
import {
  getTasks, getTaskById, createTask, updateTask, deleteTask,
  deleteAllTasks, bulkCreateTasks,
  getIssues, createIssue, updateIssue,
  deleteAllIssues, bulkCreateIssues,
} from "../controllers/taskController.js";
import { upload } from "../middleware/upload.js";

const router = express.Router();

// ── ISSUES — before /:id ───────────────────────────────────────────────────────
router.get("/issues/all",       getIssues);
router.post("/issues/create",   upload.array("media", 10), createIssue);
router.put("/issues/:id",       upload.array("media", 10), updateIssue);
router.post("/issues/bulk",     bulkCreateIssues);
router.delete("/issues/all",    deleteAllIssues);   // ← DELETE ALL ISSUES

// ── TASKS — before /:id ───────────────────────────────────────────────────────
router.post("/bulk",            bulkCreateTasks);
router.delete("/all",           deleteAllTasks);    // ← DELETE ALL TASKS

// ── TASKS CRUD ────────────────────────────────────────────────────────────────
router.get("/",                 getTasks);
router.post("/",                upload.array("media", 10), createTask);
router.put("/:id",              upload.array("media", 10), updateTask);
router.delete("/:id",           deleteTask);
router.get("/:id",              getTaskById);

export default router;