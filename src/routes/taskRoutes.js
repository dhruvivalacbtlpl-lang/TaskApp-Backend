// routes/taskRoutes.js
// npm install multer

import express from "express";
import multer  from "multer";
import {
  getTasks, getTaskById, createTask, updateTask, deleteTask, deleteAllTasks, bulkCreateTasks,
  getIssues, createIssue, updateIssue, deleteAllIssues, bulkCreateIssues,
} from "../controllers/taskController.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    cb(/\.(xlsx|xls)$/i.test(file.originalname) ? null : new Error("Only .xlsx/.xls allowed"), true);
  },
});

// ═════════════════════════════════════════════════════════════════════════════
// DEBUG — GET /api/tasks/debug
// Postman: GET http://localhost:5000/api/tasks/debug
// Shows exactly what is in your DB and diagnoses the problem
// ═════════════════════════════════════════════════════════════════════════════
router.get("/debug", async (req, res) => {
  try {
    const Task = (await import("../models/Task.js")).default;

    const [
      total,
      categoryTask,
      categoryIssue,
      oldTypeTask,
      oldTypeIssue,
      noField,
      samples,
    ] = await Promise.all([
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// MIGRATE — POST /api/tasks/migrate
// Postman: POST http://localhost:5000/api/tasks/migrate  (no body needed)
// Run ONCE if you had existing data with the old "type" field
// Converts:  type:"task"  → category:"task"
//            type:"issue" → category:"issue"
//            (no field)   → category:"task"
// ═════════════════════════════════════════════════════════════════════════════
router.post("/migrate", async (req, res) => {
  try {
    const Task = (await import("../models/Task.js")).default;

    const [r1, r2, r3] = await Promise.all([
      // old type:"task" → category:"task"
      Task.updateMany(
        { type: "task", category: { $exists: false } },
        { $set: { category: "task" }, $unset: { type: "" } }
      ),
      // old type:"issue" → category:"issue"
      Task.updateMany(
        { type: "issue", category: { $exists: false } },
        { $set: { category: "issue" }, $unset: { type: "" } }
      ),
      // docs with neither field (pre-type era) → category:"task"
      Task.updateMany(
        { type: { $exists: false }, category: { $exists: false } },
        { $set: { category: "task" } }
      ),
    ]);

    const total = r1.modifiedCount + r2.modifiedCount + r3.modifiedCount;

    res.json({
      message:         total > 0 ? "✅ Migration complete" : "ℹ️  Nothing to migrate",
      tasksConverted:  r1.modifiedCount,
      issuesConverted: r2.modifiedCount,
      noFieldFixed:    r3.modifiedCount,
      totalModified:   total,
      next:            "Now GET /api/tasks and GET /api/tasks/issues/all should return data",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Tasks ─────────────────────────────────────────────────────────────────────
router.get   ("/",     getTasks);
router.post  ("/",     createTask);
router.delete("/all",  deleteAllTasks);
router.post  ("/bulk", upload.single("file"), bulkCreateTasks);
router.get   ("/:id",  getTaskById);
router.put   ("/:id",  updateTask);
router.delete("/:id",  deleteTask);

// ── Issues ────────────────────────────────────────────────────────────────────
router.get   ("/issues/all",    getIssues);
router.post  ("/issues/create", createIssue);
router.delete("/issues/all",    deleteAllIssues);
router.post  ("/issues/bulk",   upload.single("file"), bulkCreateIssues);
router.put   ("/issues/:id",    updateIssue);

export default router;