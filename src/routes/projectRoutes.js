import express from "express";
import { protect } from "../middleware/auth.js";
import {
  getProjects, getProjectById, createProject, updateProject, deleteProject
} from "../controllers/projectController.js";

const router = express.Router();

// All routes are protected — req.user.isSuperAdmin is available to controllers
router.get("/",    protect, getProjects);
router.get("/:id", protect, getProjectById);
router.post("/",   protect, createProject);
router.put("/:id", protect, updateProject);
router.delete("/:id", protect, deleteProject);

export default router;