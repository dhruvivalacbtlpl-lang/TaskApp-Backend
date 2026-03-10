// controllers/taskController.js
import Task from "../models/Task.js";

const getIO = async () => {
  const mod = await import("../../server.js");
  return mod.io;
};

const populate = [
  { path: "taskStatus" },
  { path: "assignee", select: "name email" },
  { path: "project",  select: "name" },
];

const getMediaPaths = (files = []) =>
  files.map((f) => f.path.replace(/\\/g, "/"));

// ─── TASKS ────────────────────────────────────────────────────────────────────

export const getTasks = async (req, res) => {
  try {
    const tasks = await Task.find({
      $or: [{ type: "task" }, { type: { $exists: false } }, { type: null }],
    }).populate(populate).sort({ createdAt: -1 });
    res.json(tasks);
  } catch {
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
};

export const getTaskById = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id).populate(populate);
    if (!task) return res.status(404).json({ error: "Not found" });
    res.json(task);
  } catch {
    res.status(500).json({ error: "Failed to fetch task" });
  }
};

export const createTask = async (req, res) => {
  try {
    const { name, description, taskStatus, assignee, project } = req.body;
    if (!name || !description || !assignee)
      return res.status(400).json({ error: "name, description, and assignee are required" });

    const task      = await Task.create({ type: "task", name, description, taskStatus: taskStatus || null, assignee, project: project || null, media: getMediaPaths(req.files) });
    const populated = await Task.findById(task._id).populate(populate);
    try { const io = await getIO(); io.emit("task:created", populated); } catch {}
    // 📧 Email disabled — re-enable when ready
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: "Failed to create task", details: err.message });
  }
};

export const updateTask = async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (updateData.project    === "") updateData.project    = null;
    if (updateData.assignee   === "") updateData.assignee   = null;
    if (updateData.taskStatus === "") updateData.taskStatus = null;
    delete updateData.priority; delete updateData.issueType; delete updateData.severity;
    if (req.files?.length) updateData.media = getMediaPaths(req.files);

    const task = await Task.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: false }).populate(populate);
    if (!task) return res.status(404).json({ error: "Task not found" });
    try { const io = await getIO(); io.emit("task:updated", task); } catch {}
    // 📧 Email disabled — re-enable when ready
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: "Failed to update task", details: err.message });
  }
};

export const deleteTask = async (req, res) => {
  try {
    await Task.findByIdAndDelete(req.params.id);
    try { const io = await getIO(); io.emit("task:deleted", { _id: req.params.id }); } catch {}
    res.json({ message: "Deleted" });
  } catch {
    res.status(500).json({ error: "Failed to delete task" });
  }
};

// ─── DELETE ALL TASKS ─────────────────────────────────────────────────────────
export const deleteAllTasks = async (req, res) => {
  try {
    const result = await Task.deleteMany({
      $or: [{ type: "task" }, { type: { $exists: false } }, { type: null }],
    });
    try { const io = await getIO(); io.emit("tasks:cleared"); } catch {}
    res.json({ deleted: result.deletedCount });
  } catch {
    res.status(500).json({ error: "Failed to delete all tasks" });
  }
};

// ─── BULK CREATE TASKS ────────────────────────────────────────────────────────
// - Batches of 100 from frontend
// - insertMany per batch = fast
// - Duplicate check: skips rows where name already exists in DB

export const bulkCreateTasks = async (req, res) => {
  try {
    const { tasks, project } = req.body;
    if (!Array.isArray(tasks) || tasks.length === 0)
      return res.status(400).json({ error: "tasks array is required" });

    // All lookups in parallel — one round trip to DB
    const Staff      = (await import("../models/Staff.js")).default;
    const TaskStatus = (await import("../models/TaskStatus.js")).default;
    const incomingNames = tasks.map(t => t.name).filter(Boolean);
    const [allStaff, allStatuses, existingDocs] = await Promise.all([
      Staff.find({}, { name: 1 }).lean(),
      TaskStatus.find({}, { name: 1 }).lean(),
      Task.find(
        { name: { $in: incomingNames }, $or: [{ type: "task" }, { type: { $exists: false } }, { type: null }] },
        { name: 1 }
      ).lean(),
    ]);
    const staffMap   = new Map(allStaff.map(s   => [s.name.toLowerCase().trim(), s._id]));
    const statusMap  = new Map(allStatuses.map(s => [s.name.toLowerCase().trim(), s._id]));
    const existingSet = new Set(existingDocs.map(e => e.name.toLowerCase().trim()));

    const valid = [];
    let failed  = 0;

    for (const t of tasks) {
      if (!t.name || !t.assigneeName) { failed++; continue; }
      if (existingSet.has(t.name.toLowerCase().trim())) { failed++; continue; }
      const assigneeId = staffMap.get(t.assigneeName.toLowerCase().trim());
      if (!assigneeId) { failed++; continue; }
      valid.push({
        type: "task", name: t.name, description: t.description || "",
        taskStatus: t.statusName ? statusMap.get(t.statusName.toLowerCase().trim()) || null : null,
        assignee: assigneeId,
        project: project || null, media: [],
      });
    }

    if (valid.length === 0)
      return res.status(200).json({ created: 0, failed });

    // Single insertMany for the whole file — fastest possible
    const inserted = await Task.insertMany(valid, { ordered: false });
    try { const io = await getIO(); io.emit("tasks:bulkCreated", { count: inserted.length }); } catch {}

    res.status(201).json({ created: inserted.length, failed });
  } catch (err) {
    res.status(500).json({ error: "Bulk create tasks failed", details: err.message });
  }
};

// ─── ISSUES ───────────────────────────────────────────────────────────────────

export const getIssues = async (req, res) => {
  try {
    const issues = await Task.find({ type: "issue" }).populate(populate).sort({ createdAt: -1 });
    res.json(issues);
  } catch {
    res.status(500).json({ error: "Failed to fetch issues" });
  }
};

export const createIssue = async (req, res) => {
  try {
    const { name, description, taskStatus, assignee, project, priority, issueType, severity, dueDate } = req.body;
    if (!name || !description || !assignee)
      return res.status(400).json({ error: "name, description, and assignee are required" });

    const issue     = await Task.create({ type: "issue", name, description, taskStatus: taskStatus || null, assignee, project: project || null, media: getMediaPaths(req.files), ...(priority && { priority }), ...(issueType && { issueType }), ...(severity && { severity }), ...(dueDate && { dueDate }) });
    const populated = await Task.findById(issue._id).populate(populate);
    try { const io = await getIO(); io.emit("issue:created", populated); } catch {}
    // 📧 Email disabled — re-enable when ready
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: "Failed to create issue", details: err.message });
  }
};

export const updateIssue = async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (updateData.project    === "") updateData.project    = null;
    if (updateData.assignee   === "") updateData.assignee   = null;
    if (updateData.taskStatus === "") updateData.taskStatus = null;
    if (!updateData.priority)  delete updateData.priority;
    if (!updateData.issueType) delete updateData.issueType;
    if (!updateData.severity)  delete updateData.severity;
    if (req.files?.length) updateData.media = getMediaPaths(req.files);

    const issue = await Task.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: false }).populate(populate);
    if (!issue) return res.status(404).json({ error: "Issue not found" });
    try { const io = await getIO(); io.emit("issue:updated", issue); } catch {}
    // 📧 Email disabled — re-enable when ready
    res.json(issue);
  } catch (err) {
    res.status(500).json({ error: "Failed to update issue", details: err.message });
  }
};

// ─── DELETE ALL ISSUES ────────────────────────────────────────────────────────
export const deleteAllIssues = async (req, res) => {
  try {
    const result = await Task.deleteMany({ type: "issue" });
    try { const io = await getIO(); io.emit("issues:cleared"); } catch {}
    res.json({ deleted: result.deletedCount });
  } catch {
    res.status(500).json({ error: "Failed to delete all issues" });
  }
};

// ─── BULK CREATE ISSUES ───────────────────────────────────────────────────────
// - Batches of 100 from frontend
// - insertMany per batch = fast
// - Duplicate check: skips rows where name already exists in DB

export const bulkCreateIssues = async (req, res) => {
  try {
    const { issues, project } = req.body;
    if (!Array.isArray(issues) || issues.length === 0)
      return res.status(400).json({ error: "issues array is required" });

    // All lookups in parallel — one round trip to DB
    const Staff      = (await import("../models/Staff.js")).default;
    const TaskStatus = (await import("../models/TaskStatus.js")).default;
    const incomingNames = issues.map(t => t.name).filter(Boolean);
    const [allStaff, allStatuses, existingDocs] = await Promise.all([
      Staff.find({}, { name: 1 }).lean(),
      TaskStatus.find({}, { name: 1 }).lean(),
      Task.find({ name: { $in: incomingNames }, type: "issue" }, { name: 1 }).lean(),
    ]);
    const staffMap    = new Map(allStaff.map(s   => [s.name.toLowerCase().trim(), s._id]));
    const statusMap   = new Map(allStatuses.map(s => [s.name.toLowerCase().trim(), s._id]));
    const existingSet = new Set(existingDocs.map(e => e.name.toLowerCase().trim()));

    const valid = [];
    let failed  = 0;

    for (const t of issues) {
      if (!t.name || !t.assigneeName) { failed++; continue; }
      if (existingSet.has(t.name.toLowerCase().trim())) { failed++; continue; }
      const assigneeId = staffMap.get(t.assigneeName.toLowerCase().trim());
      if (!assigneeId) { failed++; continue; }
      valid.push({
        type: "issue", name: t.name, description: t.description || "",
        taskStatus: t.statusName ? statusMap.get(t.statusName.toLowerCase().trim()) || null : null,
        assignee: assigneeId,
        project: project || null, media: [],
        ...(t.priority  && { priority:  t.priority  }),
        ...(t.issueType && { issueType: t.issueType }),
        ...(t.severity  && { severity:  t.severity  }),
        ...(t.dueDate   && { dueDate:   t.dueDate   }),
      });
    }

    if (valid.length === 0)
      return res.status(200).json({ created: 0, failed });

    // Single insertMany for the whole file — fastest possible
    const inserted = await Task.insertMany(valid, { ordered: false });
    try { const io = await getIO(); io.emit("issues:bulkCreated", { count: inserted.length }); } catch {}

    res.status(201).json({ created: inserted.length, failed });
  } catch (err) {
    res.status(500).json({ error: "Bulk create issues failed", details: err.message });
  }
};