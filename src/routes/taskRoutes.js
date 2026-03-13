import express    from "express";
import Task        from "../models/Task.js";
import Staff       from "../models/Staff.js";
import Company     from "../models/Company.js";
import { protect } from "../middleware/auth.js";
import { calculateTaskDeadline } from "../utils/calculateTaskDeadline.js";

const router = express.Router();

/* ─── Helper: get calculated deadline ───────────────────────────────────────── */
async function getCalculatedDeadline(assigneeId, requiredHours, startDate) {
  try {
    if (!assigneeId || !requiredHours) return null;
    const staff = await Staff.findById(assigneeId).select("company");
    if (!staff?.company) return null;
    const company = await Company.findById(staff.company).select("workingHours holidays");
    if (!company) return null;
    const start = startDate ? new Date(startDate) : new Date();
    return calculateTaskDeadline(start, Number(requiredHours), company);
  } catch (err) {
    console.error("Deadline calc error:", err.message);
    return null;
  }
}

/* ─── GET /api/tasks ─────────────────────────────────────────────────────────── */
router.get("/", protect, async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.project)  filter.project  = req.query.project;
    if (req.query.assignee) filter.assignee = req.query.assignee;

    const tasks = await Task.find(filter)
      .populate("taskStatus", "name")
      .populate("assignee",   "name email")
      .populate("project",    "name")
      .sort({ createdAt: -1 });

    return res.json(tasks);
  } catch (err) {
    console.error("❌ Get tasks error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ─── GET /api/tasks/calculate-deadline ──────────────────────────────────────
 * Preview deadline before creating a task.
 * Query: ?assignee=<staffId>&hours=<number>&startDate=<ISO>
 */
router.get("/calculate-deadline", protect, async (req, res) => {
  try {
    const { assignee, hours, startDate } = req.query;
    if (!assignee || !hours) {
      return res.status(400).json({ message: "assignee and hours are required" });
    }
    const deadline = await getCalculatedDeadline(assignee, hours, startDate);
    if (!deadline) {
      return res.status(404).json({ message: "Could not calculate — check company working hours" });
    }
    return res.json({ deadline, hoursRequired: Number(hours) });
  } catch (err) {
    console.error("❌ Calculate deadline error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ─── GET /api/tasks/:id ─────────────────────────────────────────────────────── */
router.get("/:id", protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate("taskStatus", "name")
      .populate("assignee",   "name email company")
      .populate("project",    "name");

    if (!task) return res.status(404).json({ message: "Task not found" });

    // Attach live calculated deadline
    let calculatedDeadline = task.calculatedDeadline || null;
    if (task.requiredHours && task.assignee?._id && !calculatedDeadline) {
      calculatedDeadline = await getCalculatedDeadline(
        task.assignee._id,
        task.requiredHours,
        task.createdDate
      );
    }

    return res.json({ ...task.toObject(), calculatedDeadline });
  } catch (err) {
    console.error("❌ Get task error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ─── POST /api/tasks ────────────────────────────────────────────────────────── */
router.post("/", protect, async (req, res) => {
  try {
    const {
      name, description, category, taskStatus, assignee, project,
      priority, issueType, severity, dueDate, media, requiredHours,
    } = req.body;

    if (!name?.trim()) return res.status(400).json({ message: "Task name is required" });

    // Calculate deadline from company working hours if requiredHours provided
    let calculatedDeadline = null;
    if (requiredHours && assignee) {
      calculatedDeadline = await getCalculatedDeadline(assignee, requiredHours, new Date());
    }

    const task = await Task.create({
      name:               name.trim(),
      description:        description  || "",
      category:           category     || "task",
      taskStatus:         taskStatus   || null,
      assignee:           assignee     || null,
      project:            project      || null,
      priority:           priority     || null,
      issueType:          issueType    || null,
      severity:           severity     || null,
      dueDate:            calculatedDeadline || dueDate || null,
      media:              media        || [],
      requiredHours:      requiredHours ? Number(requiredHours) : null,
      calculatedDeadline: calculatedDeadline || null,
    });

    const populated = await Task.findById(task._id)
      .populate("taskStatus", "name")
      .populate("assignee",   "name email")
      .populate("project",    "name");

    return res.status(201).json({ ...populated.toObject(), calculatedDeadline });
  } catch (err) {
    console.error("❌ Create task error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ─── PUT /api/tasks/:id ─────────────────────────────────────────────────────── */
router.put("/:id", protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });

    const fields = [
      "name","description","category","taskStatus","assignee",
      "project","priority","issueType","severity","dueDate","media","requiredHours",
    ];
    fields.forEach(f => { if (req.body[f] !== undefined) task[f] = req.body[f]; });

    // Recalculate deadline if requiredHours or assignee changed
    if (req.body.requiredHours !== undefined || req.body.assignee !== undefined) {
      const deadline = await getCalculatedDeadline(
        task.assignee,
        task.requiredHours,
        task.createdDate
      );
      if (deadline) {
        task.calculatedDeadline = deadline;
        task.dueDate = deadline;
      }
    }

    await task.save();

    const updated = await Task.findById(task._id)
      .populate("taskStatus", "name")
      .populate("assignee",   "name email")
      .populate("project",    "name");

    return res.json(updated);
  } catch (err) {
    console.error("❌ Update task error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ─── DELETE /api/tasks/:id ──────────────────────────────────────────────────── */
router.delete("/:id", protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    await task.deleteOne();
    return res.json({ message: "Task deleted" });
  } catch (err) {
    console.error("❌ Delete task error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
