import mongoose from "mongoose";
import Task from "../models/Task.js";
import Staff from "../models/Staff.js";
import Company from "../models/Company.js";
import TaskStatus from "../models/TaskStatus.js";
import * as XLSX from "xlsx";
import { calculateTaskDeadline } from "../utils/calculateTaskDeadline.js";

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
    // 🔥 FILTER BY COMPANY
    const tasks = await Task.find({
      company: req.user.companyId,
      $or: [{ type: "task" }, { type: { $exists: false } }, { type: null }],
    }).populate(populate).sort({ createdAt: -1 });
    res.json(tasks);
  } catch { res.status(500).json({ error: "Failed to fetch tasks" }); }
};

export const getTaskById = async (req, res) => {
  try {
    // 🔥 FILTER BY COMPANY
    const task = await Task.findOne({ _id: req.params.id, company: req.user.companyId }).populate(populate);
    if (!task) return res.status(404).json({ error: "Not found" });
    res.json(task);
  } catch { res.status(500).json({ error: "Failed to fetch task" }); }
};

export const createTask = async (req, res) => {
  try {
    const { name, description, taskStatus, assignee, project, estimatedHours } = req.body;
    if (!name || !description || !assignee)
      return res.status(400).json({ error: "name, description, and assignee are required" });

    // 🕒 GET COMPANY FOR DEADLINE CALCULATION
    const company = await Company.findById(req.user.companyId);
    
    // 🕒 CALCULATE AUTOMATIC DEADLINE
    const deadline = estimatedHours ? calculateTaskDeadline(new Date(), estimatedHours, company) : null;

    const task = await Task.create({
      type: "task", name, description,
      taskStatus: toObjectId(taskStatus),
      assignee:   toObjectId(assignee),
      project:    toObjectId(project),
      company:    req.user.companyId, // 🔥 SET COMPANY ID
      dueDate:    deadline,           // 🔥 SET SMART DEADLINE
      estimatedHours: estimatedHours || 0,
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

    // 🔥 FILTER BY COMPANY
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, company: req.user.companyId }, 
      data, 
      { new: true, runValidators: false }
    ).populate(populate);

    if (!task) return res.status(404).json({ error: "Task not found" });
    await emit("task:updated", task);
    res.json(task);
  } catch (err) { res.status(500).json({ error: "Failed to update task", details: err.message }); }
};

export const deleteTask = async (req, res) => {
  try {
    // 🔥 FILTER BY COMPANY
    await Task.findOneAndDelete({ _id: req.params.id, company: req.user.companyId });
    await emit("task:deleted", { _id: req.params.id });
    res.json({ message: "Deleted" });
  } catch { res.status(500).json({ error: "Failed to delete task" }); }
};

export const deleteAllTasks = async (req, res) => {
  try {
    // 🔥 FILTER BY COMPANY
    const result = await Task.deleteMany({
      company: req.user.companyId,
      $or: [{ type: "task" }, { type: { $exists: false } }, { type: null }],
    });
    await emit("tasks:cleared", {});
    res.json({ deleted: result.deletedCount });
  } catch { res.status(500).json({ error: "Failed to delete all tasks" }); }
};

// ── BULK CREATE TASKS ─────────────────────────────────────────────────────────

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
        hours:        Number(n.hours || n["estimated hours"] || 0)
      };
    }).filter(r => r.name && r.assigneeName);

    // 🔥 FILTER STAFF/STATUS/EXISTING BY COMPANY
    const [allStaff, allStatuses, existing, company] = await Promise.all([
      Staff.find({ company: req.user.companyId }, { name: 1 }).lean(),
      TaskStatus.find({ company: req.user.companyId }, { name: 1 }).lean(),
      Task.find({ company: req.user.companyId, name: { $in: rows.map(r => r.name) } }, { name: 1 }).lean(),
      Company.findById(req.user.companyId)
    ]);

    const staffMap    = new Map(allStaff.map(s => [s.name.toLowerCase(), s._id]));
    const statusMap   = new Map(allStatuses.map(s => [s.name.toLowerCase(), s._id]));
    const existingSet = new Set(existing.map(e => e.name.toLowerCase()));
    const projectId   = toObjectId(req.body.project);

    const valid = [];
    for (const r of rows) {
      if (existingSet.has(r.name.toLowerCase())) continue;
      const assigneeId = staffMap.get(r.assigneeName.toLowerCase());
      if (!assigneeId) continue;

      // 🕒 BULK CALCULATE DEADLINE
      const deadline = r.hours > 0 ? calculateTaskDeadline(new Date(), r.hours, company) : null;

      valid.push({
        type: "task", name: r.name, description: r.description,
        taskStatus: r.statusName ? statusMap.get(r.statusName.toLowerCase()) || null : null,
        assignee: assigneeId,
        project:  projectId,
        company:  req.user.companyId, // 🔥 SET COMPANY ID
        dueDate:  deadline,
        media: [],
      });
    }

    if (!valid.length) return res.status(200).json({ created: 0, message: "No new valid rows." });

    const inserted = await Task.insertMany(valid, { ordered: false });
    await emit("tasks:bulkCreated", { count: inserted.length });
    res.status(201).json({ created: inserted.length });
  } catch (err) {
    res.status(500).json({ error: "Bulk upload failed", details: err.message });
  }
};

// ── ISSUES CRUD ───────────────────────────────────────────────────────────────

export const getIssues = async (req, res) => {
  try {
    // 🔥 FILTER BY COMPANY
    const issues = await Task.find({ type: "issue", company: req.user.companyId }).populate(populate).sort({ createdAt: -1 });
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
      project:    toObjectId(project),
      company:    req.user.companyId, // 🔥 SET COMPANY ID
      media:      mediaPaths(req.files),
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
    
    const issue = await Task.findOneAndUpdate(
      { _id: req.params.id, company: req.user.companyId }, 
      data, 
      { new: true, runValidators: false }
    ).populate(populate);

    if (!issue) return res.status(404).json({ error: "Issue not found" });
    await emit("issue:updated", issue);
    res.json(issue);
  } catch (err) { res.status(500).json({ error: "Failed to update issue", details: err.message }); }
};

export const deleteAllIssues = async (req, res) => {
  try {
    const result = await Task.deleteMany({ type: "issue", company: req.user.companyId });
    await emit("issues:cleared", {});
    res.json({ deleted: result.deletedCount });
  } catch { res.status(500).json({ error: "Failed to delete all issues" }); }
};

// ── BULK CREATE ISSUES ────────────────────────────────────────────────────────

export const bulkCreateIssues = async (req, res) => {
  try {
    const rows = req.body.issues;
    if (!Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ error: "No rows provided." });

    const [allStaff, allStatuses, existing, company] = await Promise.all([
      Staff.find({ company: req.user.companyId }, { name: 1 }).lean(),
      TaskStatus.find({ company: req.user.companyId }, { name: 1 }).lean(),
      Task.find({ company: req.user.companyId, name: { $in: rows.map(r => r.name) }, type: "issue" }, { name: 1 }).lean(),
      Company.findById(req.user.companyId)
    ]);

    const staffMap    = new Map(allStaff.map(s => [s.name.toLowerCase(), s._id]));
    const statusMap   = new Map(allStatuses.map(s => [s.name.toLowerCase(), s._id]));
    const existingSet = new Set(existing.map(e => e.name.toLowerCase()));
    const projectId   = toObjectId(req.body.project);

    const valid = [];
    for (const r of rows) {
      if (!r.name || !r.assigneeName || existingSet.has(r.name.toLowerCase())) continue;
      const assigneeId = staffMap.get(r.assigneeName.toLowerCase());
      if (!assigneeId) continue;

      valid.push({
        type: "issue", name: r.name,
        description: r.description || "",
        taskStatus:  r.statusName ? statusMap.get(r.statusName.toLowerCase()) || null : null,
        assignee:    assigneeId,
        project:     projectId,
        company:     req.user.companyId, // 🔥 SET COMPANY ID
        priority:    r.priority || "medium",
        severity:    r.severity || "minor",
        issueType:   "bug",
        dueDate:     r.dueDate || null,
      });
    }

    const inserted = await Task.insertMany(valid, { ordered: false });
    await emit("issues:bulkCreated", { count: inserted.length });
    res.status(201).json({ created: inserted.length });
  } catch (err) {
    res.status(500).json({ error: "Bulk upload failed", details: err.message });
  }
};