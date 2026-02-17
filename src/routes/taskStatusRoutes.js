import express from "express";
import {
  getTaskStatuses,
  getTaskStatus,
  createTaskStatus,
  updateTaskStatus,
  deleteTaskStatus
} from "../controllers/taskStatusController.js";

const router = express.Router();

router.get("/", getTaskStatuses);          // Get all
router.get("/:id", getTaskStatus);        // Get single
router.post("/", createTaskStatus);       // Create
router.put("/:id", updateTaskStatus);     // Update
router.delete("/:id", deleteTaskStatus);  // Delete

export default router;
