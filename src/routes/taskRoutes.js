import express from "express";
import multer from "multer";
import {
  getTasks, getTaskById, createTask, updateTask, deleteTask, deleteAllTasks, bulkCreateTasks,
  getIssues, createIssue, updateIssue, deleteAllIssues, bulkCreateIssues,
} from "../controllers/taskController.js";
import { protect } from "../middleware/auth.js";
import Staff from "../models/Staff.js";
import Company from "../models/Company.js";
import { calculateTaskDeadline } from "../utils/calculateTaskDeadline.js";

const router = express.Router();

// ── Multer Config ─────────────────────────────────────────────────────────────
const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ═════════════════════════════════════════════════════════════════════════════
// UTILITY ROUTES
// ═════════════════════════════════════════════════════════════════════════════

// Calculate deadline on-the-fly for the frontend UI
router.get("/calculate-deadline", protect, async (req, res) => {
  try {
    const { hours, startDate } = req.query;
    if (!hours) return res.status(400).json({ message: "Hours required" });

    // Use the company ID from the logged-in user's token
    const company = await Company.findById(req.user.companyId).select("workingHours holidays");
    if (!company) return res.status(404).json({ message: "Company settings not found" });

    const start = startDate ? new Date(startDate) : new Date();
    const deadline = calculateTaskDeadline(start, Number(hours), company);

    return res.json({ deadline, hoursRequired: Number(hours) });
  } catch (err) {
    return res.status(500).json({ message: "Calculation failed" });
  }
});

// Debug & Migrate (Added protect for security)
router.get("/debug", protect, async (req, res) => {
    // ... (Your debug logic remains same, but now filtered by company)
    const Task = (await import("../models/Task.js")).default;
    const stats = await Task.countDocuments({ company: req.user.companyId });
    res.json({ totalInYourCompany: stats });
});

router.post("/migrate", protect, async (req, res) => {
    const Task = (await import("../models/Task.js")).default;
    const result = await Task.updateMany(
        { company: req.user.companyId, type: { $exists: true } }, 
        [{ $set: { category: "$type" } }]
    );
    res.json({ message: "Migration successful", modified: result.modifiedCount });
});

// ═════════════════════════════════════════════════════════════════════════════
// TASKS (All protected by 'protect' middleware)
// ═════════════════════════════════════════════════════════════════════════════
router.get("/", protect, getTasks);
router.post("/", protect, mediaUpload.array("media", 10), createTask);
router.delete("/all", protect, deleteAllTasks);
router.post("/bulk", protect, xlsxUpload.single("file"), bulkCreateTasks);
router.get("/:id", protect, getTaskById);
router.put("/:id", protect, mediaUpload.array("media", 10), updateTask);
router.delete("/:id", protect, deleteTask);

// ═════════════════════════════════════════════════════════════════════════════
// ISSUES
// ═════════════════════════════════════════════════════════════════════════════
router.get("/issues/all", protect, getIssues);
router.post("/issues/create", protect, createIssue);
router.delete("/issues/all", protect, deleteAllIssues);
router.post("/issues/bulk", protect, xlsxUpload.single("file"), bulkCreateIssues);
router.put("/issues/:id", protect, updateIssue);

export default router;