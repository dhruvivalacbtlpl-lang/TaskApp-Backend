// routes/taskRoutes.js
import express from "express";
import {
  getTasks, getTaskById, createTask, updateTask, deleteTask,
  getIssues, createIssue,
} from "../controllers/taskController.js";

const router = express.Router();

// ISSUES — must be BEFORE /:id
router.get("/issues/all", getIssues);
router.post("/issues/create", createIssue);

// TASKS
router.get("/", getTasks);
router.post("/", createTask);
router.put("/:id", updateTask);
router.delete("/:id", deleteTask);
router.get("/:id", getTaskById);

export default router; 