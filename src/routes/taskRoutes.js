// routes/taskRoutes.js
import express from "express";
import multer  from "multer";
import {
  getTasks, getTaskById, createTask, updateTask, deleteTask, deleteAllTasks, bulkCreateTasks,
  getIssues, createIssue, updateIssue, deleteAllIssues, bulkCreateIssues,
} from "../controllers/taskController.js";

const router = express.Router();

// ── Multer for xlsx bulk uploads ──────────────────────────────────────────────
const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    cb(/\.(xlsx|xls)$/i.test(file.originalname) ? null : new Error("Only .xlsx/.xls allowed"), true);
  },
});

// ── Multer for task media (images/videos) ─────────────────────────────────────
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    cb(/\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|mkv)$/i.test(file.originalname)
      ? null : new Error("Only images/videos allowed"), true);
  },
});

// ═════════════════════════════════════════════════════════════════════════════
// DEBUG — GET /api/tasks/debug
// ═════════════════════════════════════════════════════════════════════════════
router.get("/debug", async (req, res) => {
  try {
    const Task = (await import("../models/Task.js")).default;
    const [total, categoryTask, categoryIssue, oldTypeTask, oldTypeIssue, noField, samples] =
      await Promise.all([
        Task.countDocuments(),
        Task.countDocuments({ category: "task" }),
        Task.countDocuments({ category: "issue" }),
        Task.countDocuments({ type: "task" }),
        Task.countDocuments({ type: "issue" }),
        Task.countDocuments({ category: { $exists: false }, type: { $exists: false } }),
        Task.find().limit(3).lean(),
      ]);
    res.json({
      totalDocsInCollection: total,
      newField_category: { task: categoryTask, issue: categoryIssue },
      oldField_type:     { task: oldTypeTask,  issue: oldTypeIssue  },
      hasNeitherField:   noField,
      sampleDocs: samples,
      diagnosis:
        total === 0
          ? "❌ Collection is completely EMPTY"
          : categoryTask === 0 && categoryIssue === 0 && (oldTypeTask > 0 || oldTypeIssue > 0)
          ? "⚠️  Data uses OLD field 'type' — POST /api/tasks/migrate to fix"
          : categoryTask > 0 || categoryIssue > 0
          ? "✅ Data is correct — 'category' field present"
          : "⚠️  Docs exist but have neither 'type' nor 'category' — POST /api/tasks/migrate",
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
// MIGRATE — POST /api/tasks/migrate
// ═════════════════════════════════════════════════════════════════════════════
router.post("/migrate", async (req, res) => {
  try {
    const Task = (await import("../models/Task.js")).default;
    const [r1, r2, r3] = await Promise.all([
      Task.updateMany({ type: "task",  category: { $exists: false } }, { $set: { category: "task"  }, $unset: { type: "" } }),
      Task.updateMany({ type: "issue", category: { $exists: false } }, { $set: { category: "issue" }, $unset: { type: "" } }),
      Task.updateMany({ type: { $exists: false }, category: { $exists: false } }, { $set: { category: "task" } }),
    ]);
    const total = r1.modifiedCount + r2.modifiedCount + r3.modifiedCount;
    res.json({
      message:         total > 0 ? "✅ Migration complete" : "ℹ️  Nothing to migrate",
      tasksConverted:  r1.modifiedCount,
      issuesConverted: r2.modifiedCount,
      noFieldFixed:    r3.modifiedCount,
      totalModified:   total,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
// TASKS
// ═════════════════════════════════════════════════════════════════════════════
router.get   ("/",     getTasks);
router.post  ("/",     mediaUpload.array("media", 10), createTask);   // ✅ FIX: multer parses multipart/form-data
router.delete("/all",  deleteAllTasks);
router.post  ("/bulk", xlsxUpload.single("file"), bulkCreateTasks);
router.get   ("/:id",  getTaskById);
router.put   ("/:id",  mediaUpload.array("media", 10), updateTask);   // ✅ FIX: multer on update too
router.delete("/:id",  deleteTask);

// ═════════════════════════════════════════════════════════════════════════════
// ISSUES
// ═════════════════════════════════════════════════════════════════════════════
router.get   ("/issues/all",    getIssues);
router.post  ("/issues/create", createIssue);
router.delete("/issues/all",    deleteAllIssues);
router.post  ("/issues/bulk",   xlsxUpload.single("file"), bulkCreateIssues);
router.put   ("/issues/:id",    updateIssue);

export default router;