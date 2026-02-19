import express from "express";
import {
  getTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
} from "../controllers/taskController.js";

import { upload } from "../middleware/upload.js";

const router = express.Router();

router.get("/", getTasks);
router.get("/:id", getTask);
router.post("/", upload.array("media"), createTask);
router.put("/:id", upload.array("media"), updateTask);
router.delete("/:id", deleteTask);

export default router;
