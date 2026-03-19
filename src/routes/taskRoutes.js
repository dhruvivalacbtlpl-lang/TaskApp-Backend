import express from "express";
import multer  from "multer";
import path    from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import {
  getTasks, getTaskById, createTask, updateTask, deleteTask, deleteAllTasks, bulkCreateTasks,
  getIssues, createIssue, updateIssue, deleteAllIssues, bulkCreateIssues,
  getOwnerAllTasks,
  getAllTasksSuperAdmin,
} from "../controllers/taskController.js";
import { protect, superAdminOnly } from "../middleware/auth.js";
import { checkLimit }  from "../middleware/checkLimit.js";  // ← NEW
import Company from "../models/Company.js";
import { calculateTaskDeadline } from "../utils/calculateTaskDeadline.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const router = express.Router();

// ── Multer: XLSX in memory ─────────────────────────────────────────────────────
const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 200 * 1024 * 1024 },
});

// ── Multer: media to disk ──────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, "../../uploads/images");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const mediaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename:    (_req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/\s+/g, "_");
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

const mediaUpload = multer({
  storage: mediaStorage,
  limits:  { fileSize: 50 * 1024 * 1024 },
});

// ── Utility routes ─────────────────────────────────────────────────────────────
router.get("/calculate-deadline", protect, async (req, res) => {
  try {
    const { hours, startDate } = req.query;
    if (!hours) return res.status(400).json({ message: "Hours required" });
    const company = await Company.findById(req.user.companyId).select("workingHours holidays");
    if (!company) return res.status(404).json({ message: "Company settings not found" });
    const start    = startDate ? new Date(startDate) : new Date();
    const deadline = calculateTaskDeadline(start, Number(hours), company);
    return res.json({ deadline, hoursRequired: Number(hours) });
  } catch {
    return res.status(500).json({ message: "Calculation failed" });
  }
});

router.get("/debug", protect, async (req, res) => {
  const Task  = (await import("../models/Task.js")).default;
  const stats = await Task.countDocuments({ company: req.user.companyId });
  res.json({ totalInYourCompany: stats });
});

router.post("/migrate", protect, async (req, res) => {
  const Task   = (await import("../models/Task.js")).default;
  const result = await Task.updateMany(
    { company: req.user.companyId, type: { $exists: true } },
    [{ $set: { category: "$type" } }]
  );
  res.json({ message: "Migration successful", modified: result.modifiedCount });
});

// ── Owner: all tasks for their company ────────────────────────────────────────
router.get("/owner/all", protect, getOwnerAllTasks);

// ── SuperAdmin: all tasks across every company ────────────────────────────────
router.get("/super/all", protect, superAdminOnly, getAllTasksSuperAdmin);

// ════════════════════════════════════════════════════════════════════════════
// TASKS
// ════════════════════════════════════════════════════════════════════════════
router.get("/",       protect, getTasks);
router.get("/:id",    protect, getTaskById);
router.delete("/all", protect, deleteAllTasks);

// ✅ checkLimit("tasks") — blocks task creation if plan limit reached
router.post("/",
  protect,
  checkLimit("tasks"),
  mediaUpload.array("media", 10),
  createTask
);

// ✅ checkLimit("tasks") — bulk upload also counts against the limit
//    (checkLimit checks current count; bulk will add many — we allow it
//     and let the handler decide; or block at middleware level by count check)
router.post("/bulk",
  protect,
  checkLimit("tasks"),
  xlsxUpload.single("file"),
  bulkCreateTasks
);

router.put("/:id",    protect, mediaUpload.array("media", 10), updateTask);
router.delete("/:id", protect, deleteTask);

// ════════════════════════════════════════════════════════════════════════════
// ISSUES
// ════════════════════════════════════════════════════════════════════════════
router.get("/issues/all",    protect, getIssues);
router.delete("/issues/all", protect, deleteAllIssues);

// ✅ checkLimit("issues") — blocks issue creation if plan limit reached
router.post("/issues/create",
  protect,
  checkLimit("issues"),
  createIssue
);

// ✅ checkLimit("issues") for bulk issues too
router.post("/issues/bulk",
  protect,
  checkLimit("issues"),
  xlsxUpload.single("file"),
  bulkCreateIssues
);

router.put("/issues/:id", protect, updateIssue);

export default router;