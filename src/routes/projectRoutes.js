import express from "express";
import Project from "../models/Project.js";
import { protect } from "../middleware/auth.js";
import { logAudit } from "../utils/logAudit.js";
import {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
} from "../controllers/projectController.js";

const router = express.Router();

// ── Reads ─────────────────────────────────────────────────────────────────────
router.get("/",    protect, getProjects);
router.get("/:id", protect, getProjectById);

// ── CREATE ────────────────────────────────────────────────────────────────────
router.post("/", protect, async (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = async (data) => {
    if (res.statusCode < 400 && data?._id) {
      await logAudit(req, "Project", "CREATE",
        `Created project "${data.name}"`,
        { entityId: data._id?.toString(), entityName: data.name }
      );
    }
    return originalJson(data);
  };
  return createProject(req, res, next);
});

// ── UPDATE ────────────────────────────────────────────────────────────────────
router.put("/:id", protect, async (req, res, next) => {
  const before = await Project.findById(req.params.id).select("name").lean();
  const originalJson = res.json.bind(res);
  res.json = async (data) => {
    if (res.statusCode < 400 && data) {
      await logAudit(req, "Project", "UPDATE",
        `Updated project "${data.name || before?.name}"`,
        { entityId: req.params.id, entityName: data.name || before?.name, before }
      );
    }
    return originalJson(data);
  };
  return updateProject(req, res, next);
});

// ── DELETE ────────────────────────────────────────────────────────────────────
router.delete("/:id", protect, async (req, res, next) => {
  const project = await Project.findById(req.params.id).select("name").lean();
  const projectName = project?.name || req.params.id;
  const originalJson = res.json.bind(res);
  res.json = async (data) => {
    if (res.statusCode < 400) {
      await logAudit(req, "Project", "DELETE",
        `Deleted project "${projectName}"`,
        { entityId: req.params.id, entityName: projectName }
      );
    }
    return originalJson(data);
  };
  return deleteProject(req, res, next);
});

export default router;