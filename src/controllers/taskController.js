import mongoose from "mongoose";
import Task from "../models/Task.js";
import Staff from "../models/Staff.js";
import TaskStatus from "../models/TaskStatus.js";
import * as XLSX from "xlsx";

const { Types: { ObjectId } } = mongoose;

const getIO = async () => {
  try { const mod = await import("../../server.js"); return mod.io; } catch { return null; }
};

const emit = async (event, data) => {
  try { const io = await getIO(); if (io) io.emit(event, data); } catch {}
};

const populate = [
  { path: "taskStatus" },
  { path: "assignee", select: "name email" },
  { path: "project",  select: "name" },
];

const mediaPaths = (files = []) => files.map(f => f.path.replace(/\\/g, "/"));

// ── helper: safely cast a string to ObjectId, or return null ─────────────────
const toObjectId = (val) => {
  if (!val) return null;
  try {
    return ObjectId.isValid(val) ? new ObjectId(String(val)) : null;
  } catch {
    return null;
  }
};

// ── TASKS CRUD ────────────────────────────────────────────────────────────────

export const getTasks = async (req, res) => {
  try {
    const tasks = await Task.find({
      $or: [{ type: "task" }, { type: { $exists: false } }, { type: null }],
    }).populate(populate).sort({ createdAt: -1 });
    res.json(tasks);
  } catch { res.status(500).json({ error: "Failed to fetch tasks" }); }
};

export const getTaskById = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id).populate(populate);
    if (!task) return res.status(404).json({ error: "Not found" });
    res.json(task);
  } catch { res.status(500).json({ error: "Failed to fetch task" }); }
};

export const createTask = async (req, res) => {
  try {
    const { name, description, taskStatus, assignee, project } = req.body;
    if (!name || !description || !assignee)
      return res.status(400).json({ error: "name, description, and assignee are required" });
    const task = await Task.create({
      type: "task", name, description,
      taskStatus: toObjectId(taskStatus),
      assignee:   toObjectId(assignee),
      project:    toObjectId(project),
      media: mediaPaths(req.files),
    });
    const populated = await Task.findById(task._id).populate(populate);
    await emit("task:created", populated);
    res.status(201).json(populated);
  } catch (err) { res.status(500).json({ error: "Failed to create task", details: err.message }); }
};

export const updateTask = async (req, res) => {
  try {
    const data = { ...req.body };
    data.project    = toObjectId(data.project);
    data.assignee   = toObjectId(data.assignee);
    data.taskStatus = toObjectId(data.taskStatus);
    delete data.priority; delete data.issueType; delete data.severity;
    if (req.files?.length) data.media = mediaPaths(req.files);
    const task = await Task.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: false }).populate(populate);
    if (!task) return res.status(404).json({ error: "Task not found" });
    await emit("task:updated", task);
    res.json(task);
  } catch (err) { res.status(500).json({ error: "Failed to update task", details: err.message }); }
};

export const deleteTask = async (req, res) => {
  try {
    await Task.findByIdAndDelete(req.params.id);
    await emit("task:deleted", { _id: req.params.id });
    res.json({ message: "Deleted" });
  } catch { res.status(500).json({ error: "Failed to delete task" }); }
};

export const deleteAllTasks = async (req, res) => {
  try {
    const result = await Task.deleteMany({
      $or: [{ type: "task" }, { type: { $exists: false } }, { type: null }],
    });
    await emit("tasks:cleared", {});
    res.json({ deleted: result.deletedCount });
  } catch { res.status(500).json({ error: "Failed to delete all tasks" }); }
};

// ── BULK CREATE TASKS — receives raw .xlsx file, parses on backend ────────────

export const bulkCreateTasks = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Excel file required" });

    const wb  = XLSX.read(req.file.buffer, { type: "buffer" });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { defval: "" });
    if (!raw.length) return res.status(400).json({ error: "File is empty" });

    const rows = raw.map(row => {
      const n = {};
      Object.keys(row).forEach(k => { n[k.trim().toLowerCase()] = String(row[k] ?? "").trim(); });
      return {
        name:         n.name || n.title || n["task name"] || "",
        description:  n.description || n.desc || "",
        assigneeName: n.assignee || n["assigned to"] || n.staff || "",
        statusName:   n.status || n["task status"] || "",
      };
    }).filter(r => r.name && r.assigneeName);

    if (!rows.length)
      return res.status(400).json({ error: "No valid rows found. Make sure columns 'name' and 'assignee' exist." });

    const names = rows.map(r => r.name);
    const [allStaff, allStatuses, existing] = await Promise.all([
      Staff.find({}, { name: 1 }).lean(),
      TaskStatus.find({}, { name: 1 }).lean(),
      Task.find({ name: { $in: names }, $or: [{ type: "task" }, { type: { $exists: false } }, { type: null }] }, { name: 1 }).lean(),
    ]);
    const staffMap    = new Map(allStaff.map(s => [s.name.toLowerCase(), s._id]));
    const statusMap   = new Map(allStatuses.map(s => [s.name.toLowerCase(), s._id]));
    const existingSet = new Set(existing.map(e => e.name.toLowerCase()));

    // ✅ Cast project to ObjectId once, reuse for all rows
    const projectId = toObjectId(req.body.project);

    const valid = [];
    let skipped = 0;

    for (const r of rows) {
      const key = r.name.toLowerCase();
      if (existingSet.has(key)) { skipped++; continue; }
      const assigneeId = staffMap.get(r.assigneeName.toLowerCase());
      if (!assigneeId) { skipped++; continue; }
      valid.push({
        type: "task", name: r.name, description: r.description,
        taskStatus: r.statusName ? statusMap.get(r.statusName.toLowerCase()) || null : null,
        assignee: assigneeId,
        project:  projectId,   // ✅ proper ObjectId or null
        media: [],
      });
    }

    if (!valid.length)
      return res.status(200).json({ created: 0, skipped, message: "All rows were duplicates or had unmatched assignees." });

    const inserted = await Task.insertMany(valid, { ordered: false });
    await emit("tasks:bulkCreated", { count: inserted.length });

    res.status(201).json({ created: inserted.length, skipped });
  } catch (err) {
    res.status(500).json({ error: "Bulk upload failed", details: err.message });
  }
};

// ── ISSUES CRUD ───────────────────────────────────────────────────────────────

export const getIssues = async (req, res) => {
  try {
    const issues = await Task.find({ type: "issue" }).populate(populate).sort({ createdAt: -1 });
    res.json(issues);
  } catch { res.status(500).json({ error: "Failed to fetch issues" }); }
};

export const createIssue = async (req, res) => {
  try {
    const { name, description, taskStatus, assignee, project, priority, issueType, severity, dueDate } = req.body;
    if (!name || !description || !assignee)
      return res.status(400).json({ error: "name, description, and assignee are required" });
    const issue = await Task.create({
      type: "issue", name, description,
      taskStatus: toObjectId(taskStatus),
      assignee:   toObjectId(assignee),
      project:    toObjectId(project),   // ✅ proper ObjectId or null
      media: mediaPaths(req.files),
      ...(priority  && { priority }),
      ...(issueType && { issueType }),
      ...(severity  && { severity }),
      ...(dueDate   && { dueDate }),
    });
    const populated = await Task.findById(issue._id).populate(populate);
    await emit("issue:created", populated);
    res.status(201).json(populated);
  } catch (err) { res.status(500).json({ error: "Failed to create issue", details: err.message }); }
};

export const updateIssue = async (req, res) => {
  try {
    const data = { ...req.body };
    data.project    = toObjectId(data.project);
    data.assignee   = toObjectId(data.assignee);
    data.taskStatus = toObjectId(data.taskStatus);
    if (!data.priority)  delete data.priority;
    if (!data.issueType) delete data.issueType;
    if (!data.severity)  delete data.severity;
    if (req.files?.length) data.media = mediaPaths(req.files);
    const issue = await Task.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: false }).populate(populate);
    if (!issue) return res.status(404).json({ error: "Issue not found" });
    await emit("issue:updated", issue);
    res.json(issue);
  } catch (err) { res.status(500).json({ error: "Failed to update issue", details: err.message }); }
};

export const deleteAllIssues = async (req, res) => {
  try {
    const result = await Task.deleteMany({ type: "issue" });
    await emit("issues:cleared", {});
    res.json({ deleted: result.deletedCount });
  } catch { res.status(500).json({ error: "Failed to delete all issues" }); }
};

// ── BULK CREATE ISSUES ────────────────────────────────────────────────────────
// Accepts JSON body: { issues: [...parsedRows], project: "id" }
// Frontend parses the Excel client-side and sends rows in chunks.

export const bulkCreateIssues = async (req, res) => {
  try {
    const rows = req.body.issues;
    if (!Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ error: "No rows provided. Send { issues: [...] }" });

    const names = rows.map(r => r.name).filter(Boolean);
    if (!names.length)
      return res.status(400).json({ error: "No valid rows — all rows are missing 'name'." });

    const [allStaff, allStatuses, existing] = await Promise.all([
      Staff.find({}, { name: 1 }).lean(),
      TaskStatus.find({}, { name: 1 }).lean(),
      Task.find({ name: { $in: names }, type: "issue" }, { name: 1 }).lean(),
    ]);
    const staffMap    = new Map(allStaff.map(s => [s.name.toLowerCase(), s._id]));
    const statusMap   = new Map(allStatuses.map(s => [s.name.toLowerCase(), s._id]));
    const existingSet = new Set(existing.map(e => e.name.toLowerCase()));

    // ✅ Cast project to ObjectId once, reuse for all rows
    const projectId = toObjectId(req.body.project);

    const valid = [];
    let skipped = 0, unmatched = [];

    for (const r of rows) {
      if (!r.name || !r.assigneeName) { skipped++; continue; }
      const key = r.name.toLowerCase();
      if (existingSet.has(key)) { skipped++; continue; }
      const assigneeId = staffMap.get(r.assigneeName.toLowerCase());
      if (!assigneeId) {
        unmatched.push(r.assigneeName);
        skipped++; continue;
      }
      valid.push({
        type: "issue", name: r.name,
        description: r.description || "",
        taskStatus:  r.statusName ? statusMap.get(r.statusName.toLowerCase()) || null : null,
        assignee:    assigneeId,
        project:     projectId,
        media:       [],
        priority:    ["low","medium","high","critical"].includes(r.priority) ? r.priority : "medium",
        severity:    ["minor","moderate","major","critical"].includes(r.severity) ? r.severity : "minor",
        issueType:   "bug",
        ...(r.dueDate && { dueDate: r.dueDate }),
      });
    }

    if (!valid.length)
      return res.status(200).json({
        created: 0, skipped, duplicates: 0,
        unmatchedAssignees: [...new Set(unmatched)].slice(0, 10),
        message: "All rows were duplicates or had unmatched assignees.",
      });

    const inserted = await Task.insertMany(valid, { ordered: false });
    await emit("issues:bulkCreated", { count: inserted.length });

    res.status(201).json({
      created:    inserted.length,
      skipped,
      duplicates: 0,
      unmatchedAssignees: [...new Set(unmatched)].slice(0, 10),
    });
  } catch (err) {
    res.status(500).json({ error: "Bulk upload failed", details: err.message });
  }
};