// controllers/taskController.js
import Task from "../models/Task.js";
import * as XLSX from "xlsx";

const CHUNK_SIZE      = 5_000;
const PARALLEL_CHUNKS = 4;
const MAX_ROWS        = 1_100_000;

const emit = async (event, data) => {
  try { const { io } = await import("../../server.js"); if (io) io.emit(event, data); } catch {}
};

const populate = [
  { path: "taskStatus" },
  { path: "assignee", select: "name email" },
  { path: "project",  select: "name" },
];

// ── Parse xlsx buffer (backend only) ─────────────────────────────────────────
function parseXlsx(buffer) {
  const wb  = XLSX.read(buffer, { type: "buffer", dense: true });
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { defval: "" });
  const rows = [];
  for (const row of raw) {
    const n = Object.fromEntries(Object.entries(row).map(([k,v]) => [k.trim().toLowerCase(), v]));
    const name   = String(n.name || n.title || n["issue name"] || n["task name"] || "").trim();
    const assign = String(n.assignee || n["assigned to"] || n.staff || "").trim();
    if (!name || !assign) continue;
    const dv = n["due date"] || n.duedate || n.due || "";
    let dueDate = null;
    if (dv) {
      const d = typeof dv === "number"
        ? new Date(Math.round((dv - 25569) * 86400000))
        : new Date(dv);
      if (!isNaN(d)) dueDate = d.toISOString().split("T")[0];
    }
    const priority = String(n.priority || "medium").toLowerCase();
    const severity = String(n.severity || "minor").toLowerCase();
    rows.push({
      name, assigneeName: assign,
      description: String(n.description || n.desc || "").trim(),
      statusName:  String(n.status || n["task status"] || "").trim(),
      priority:  ["low","medium","high","critical"].includes(priority) ? priority : "medium",
      severity:  ["minor","moderate","major","critical"].includes(severity) ? severity : "minor",
      issueType: "bug",
      dueDate,
    });
  }
  return rows;
}

// ── Parallel chunked insertMany ───────────────────────────────────────────────
async function parallelInsert(docs) {
  const chunks = [];
  for (let i = 0; i < docs.length; i += CHUNK_SIZE)
    chunks.push(docs.slice(i, i + CHUNK_SIZE));

  let created = 0, duplicates = 0;
  for (let i = 0; i < chunks.length; i += PARALLEL_CHUNKS) {
    const results = await Promise.allSettled(
      chunks.slice(i, i + PARALLEL_CHUNKS).map(c =>
        Task.insertMany(c, { ordered: false, lean: true })
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled") {
        created += r.value.length;
      } else {
        const ins = r.reason?.insertedDocs?.length ?? r.reason?.result?.result?.nInserted ?? 0;
        created    += ins;
        duplicates += CHUNK_SIZE - ins;
      }
    }
  }
  return { created, duplicates };
}

// ── Shared bulk handler ───────────────────────────────────────────────────────
async function handleBulk(req, res, category) {
  try {
    const Staff      = (await import("../models/Staff.js")).default;
    const TaskStatus = (await import("../models/TaskStatus.js")).default;

    let rows = [];
    if (req.file) {
      rows = parseXlsx(req.file.buffer);
    } else {
      const body = req.body?.tasks || req.body?.issues;
      if (!Array.isArray(body) || !body.length)
        return res.status(400).json({ error: "Send file (form-data key='file') or tasks[]/issues[] in body." });
      rows = body;
    }

    if (!rows.length)
      return res.status(400).json({ error: "No valid rows. File must have 'name' and 'assignee' columns." });
    if (rows.length > MAX_ROWS)
      return res.status(413).json({ error: `Max ${MAX_ROWS.toLocaleString()} rows.` });

    const project = req.body?.project || null;

    const [allStaff, allStatuses] = await Promise.all([
      Staff.find({}, { name: 1 }).lean(),
      TaskStatus.find({}, { name: 1 }).lean(),
    ]);
    const staffMap  = new Map(allStaff.map(s  => [s.name.toLowerCase().trim(), s._id]));
    const statusMap = new Map(allStatuses.map(s => [s.name.toLowerCase().trim(), s._id]));

    const docs = [], unmatched = new Set();
    let failed = 0;

    for (const r of rows) {
      const assigneeId = staffMap.get((r.assigneeName||"").toLowerCase().trim());
      if (!assigneeId) { unmatched.add(r.assigneeName); failed++; continue; }
      const doc = {
        category, name: r.name,
        description: r.description || "",
        taskStatus:  r.statusName ? statusMap.get(r.statusName.toLowerCase().trim()) || null : null,
        assignee: assigneeId,
        project:  project || null,
        media: [],
      };
      if (category === "issue") {
        doc.priority  = r.priority  || "medium";
        doc.issueType = r.issueType || "bug";
        doc.severity  = r.severity  || "minor";
        doc.dueDate   = r.dueDate   || null;
      }
      docs.push(doc);
    }

    if (!docs.length)
      return res.status(200).json({
        created: 0, failed, duplicates: 0, totalRows: rows.length,
        unmatchedAssignees: [...unmatched].slice(0,10),
        message: "0 inserted — assignee names must match Staff exactly",
      });

    const { created, duplicates } = await parallelInsert(docs);
    await emit(`${category}s:bulkCreated`, { count: created });

    return res.status(201).json({
      created, failed: failed + duplicates, duplicates,
      totalRows: rows.length,
      unmatchedAssignees: [...unmatched].slice(0,10),
      message: `${created.toLocaleString()} ${category}s inserted`,
    });
  } catch (err) {
    console.error(`bulk ${category}:`, err.message);
    res.status(500).json({ error: `Bulk ${category} failed`, details: err.message });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// TASKS
// ═════════════════════════════════════════════════════════════════════════════

export const getTasks = async (req, res) => {
  try {
    const tasks = await Task.find({ category: "task" }).populate(populate).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const getTaskById = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id).populate(populate);
    if (!task) return res.status(404).json({ error: "Not found" });
    res.json(task);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const createTask = async (req, res) => {
  try {
    const { name, description, taskStatus, assignee, project } = req.body;
    if (!name || !assignee) return res.status(400).json({ error: "name and assignee required" });
    const task = await Task.create({ category:"task", name, description:description||"", taskStatus:taskStatus||null, assignee, project:project||null, media:[] });
    const pop  = await Task.findById(task._id).populate(populate);
    await emit("task:created", pop);
    res.status(201).json(pop);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const updateTask = async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.project    === "") data.project    = null;
    if (data.assignee   === "") data.assignee   = null;
    if (data.taskStatus === "") data.taskStatus = null;
    const task = await Task.findByIdAndUpdate(req.params.id, data, { new:true, runValidators:false }).populate(populate);
    if (!task) return res.status(404).json({ error: "Not found" });
    await emit("task:updated", task);
    res.json(task);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const deleteTask = async (req, res) => {
  try {
    await Task.findByIdAndDelete(req.params.id);
    await emit("task:deleted", { _id: req.params.id });
    res.json({ message: "Deleted" });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const deleteAllTasks = async (req, res) => {
  try {
    const { deletedCount } = await Task.deleteMany({ category: "task" });
    await emit("tasks:cleared", {});
    res.json({ deleted: deletedCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const bulkCreateTasks = (req, res) => handleBulk(req, res, "task");

// ═════════════════════════════════════════════════════════════════════════════
// ISSUES — server-side paginated GET
// ═════════════════════════════════════════════════════════════════════════════

// GET /api/tasks/issues/all?page=1&limit=50&project=xxx
// Returns: { issues[], total, page, pages }
// Frontend paginates by calling this — never fetches all 1L at once
export const getIssues = async (req, res) => {
  try {
    const page    = Math.max(1, parseInt(req.query.page)  || 1);
    const limit   = Math.min(100, parseInt(req.query.limit) || 50);
    const project = req.query.project || null;

    const filter = { category: "issue" };
    if (project) filter.project = project;

    const [issues, total] = await Promise.all([
      Task.find(filter)
        .populate(populate)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Task.countDocuments(filter),
    ]);

    res.json({
      issues,
      total,
      page,
      pages: Math.ceil(total / limit),
      limit,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const createIssue = async (req, res) => {
  try {
    const { name, description, taskStatus, assignee, project, priority, issueType, severity, dueDate } = req.body;
    if (!name || !assignee) return res.status(400).json({ error: "name and assignee required" });
    const issue = await Task.create({
      category:"issue", name, description:description||"",
      taskStatus:taskStatus||null, assignee, project:project||null,
      media:[], priority:priority||"medium", issueType:issueType||"bug",
      severity:severity||"minor", dueDate:dueDate||null,
    });
    const pop = await Task.findById(issue._id).populate(populate);
    await emit("issue:created", pop);
    res.status(201).json(pop);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const updateIssue = async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.project    === "") data.project    = null;
    if (data.assignee   === "") data.assignee   = null;
    if (data.taskStatus === "") data.taskStatus = null;
    const issue = await Task.findByIdAndUpdate(req.params.id, data, { new:true, runValidators:false }).populate(populate);
    if (!issue) return res.status(404).json({ error: "Not found" });
    await emit("issue:updated", issue);
    res.json(issue);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const deleteAllIssues = async (req, res) => {
  try {
    const { deletedCount } = await Task.deleteMany({ category: "issue" });
    await emit("issues:cleared", {});
    res.json({ deleted: deletedCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const bulkCreateIssues = (req, res) => handleBulk(req, res, "issue");