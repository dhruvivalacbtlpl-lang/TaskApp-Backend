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

  const mediaPaths = (files = []) =>
    files.map(f => {
      if (!f.path) return null;
      const normalized = f.path.replace(/\\/g, "/");
      const idx = normalized.indexOf("uploads/");
      const url = idx !== -1 ? "/" + normalized.slice(idx) : normalized;
      return {
        url,
        originalName: f.originalname || f.filename || "",
        mimetype:     f.mimetype     || "",
        size:         f.size         || 0,
        path:         url,
      };
    }).filter(Boolean);

  const toObjectId = (val) => {
    if (!val) return null;
    try { return ObjectId.isValid(val) ? new ObjectId(String(val)) : null; }
    catch { return null; }
  };

  const calcDeadline = async (companyId, hours) => {
    if (!companyId || !hours || Number(hours) <= 0) return null;
    try {
      const company = await Company.findById(companyId).select("workingHours holidays");
      if (!company) return null;
      return calculateTaskDeadline(new Date(), Number(hours), company);
    } catch { return null; }
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // TASKS CRUD
  // ══════════════════════════════════════════════════════════════════════════════

  export const getTasks = async (req, res) => {
    try {
      const tasks = await Task.find({
        company: req.user.companyId,
        $or: [{ type: "task" }, { type: { $exists: false } }, { type: null }],
      }).populate(populate).sort({ createdAt: -1 });
      res.json(tasks);
    } catch { res.status(500).json({ error: "Failed to fetch tasks" }); }
  };

  export const getTaskById = async (req, res) => {
    try {
      const task = await Task.findOne({ _id: req.params.id, company: req.user.companyId }).populate(populate);
      if (!task) return res.status(404).json({ error: "Not found" });
      res.json(task);
    } catch { res.status(500).json({ error: "Failed to fetch task" }); }
  };

  export const createTask = async (req, res) => {
    try {
      const { name, description, taskStatus, assignee, project, requiredHours, estimatedHours } = req.body;
      if (!name || !description || !assignee)
        return res.status(400).json({ error: "name, description, and assignee are required" });

      const hours = requiredHours || estimatedHours || 0;
      const deadline = hours > 0 ? await calcDeadline(req.user.companyId, hours) : null;

      const task = await Task.create({
        type: "task", name, description,
        taskStatus:         toObjectId(taskStatus),
        assignee:           toObjectId(assignee),
        project:            toObjectId(project),
        company:            req.user.companyId,
        dueDate:            deadline,
        calculatedDeadline: deadline,
        requiredHours:      hours || null,
        estimatedHours:     hours || 0,
        media:              mediaPaths(req.files),
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

      const hours = data.requiredHours || data.estimatedHours;
      if (hours && Number(hours) > 0) {
        const deadline = await calcDeadline(req.user.companyId, hours);
        if (deadline) { data.dueDate = deadline; data.calculatedDeadline = deadline; }
        data.requiredHours = Number(hours); data.estimatedHours = Number(hours);
      }

      const task = await Task.findOneAndUpdate(
        { _id: req.params.id, company: req.user.companyId },
        data, { new: true, runValidators: false }
      ).populate(populate);

      if (!task) return res.status(404).json({ error: "Task not found" });
      await emit("task:updated", task);
      res.json(task);
    } catch (err) { res.status(500).json({ error: "Failed to update task", details: err.message }); }
  };

  export const deleteTask = async (req, res) => {
    try {
      await Task.findOneAndDelete({ _id: req.params.id, company: req.user.companyId });
      await emit("task:deleted", { _id: req.params.id });
      res.json({ message: "Deleted" });
    } catch { res.status(500).json({ error: "Failed to delete task" }); }
  };

  export const deleteAllTasks = async (req, res) => {
    try {
      const result = await Task.deleteMany({
        company: req.user.companyId,
        $or: [{ type: "task" }, { type: { $exists: false } }, { type: null }],
      });
      await emit("tasks:cleared", {});
      res.json({ deleted: result.deletedCount });
    } catch { res.status(500).json({ error: "Failed to delete all tasks" }); }
  };

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
          hours:        Number(n.hours || n["estimated hours"] || n["required hours"] || 0),
        };
      }).filter(r => r.name && r.assigneeName);

      const [allStaff, allStatuses, existing, company] = await Promise.all([
        Staff.find({ company: req.user.companyId }, { name: 1 }).lean(),
        TaskStatus.find({}, { name: 1 }).lean(),
        Task.find({ company: req.user.companyId, name: { $in: rows.map(r => r.name) } }, { name: 1 }).lean(),
        Company.findById(req.user.companyId).select("workingHours holidays"),
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
        const deadline = r.hours > 0 && company ? calculateTaskDeadline(new Date(), r.hours, company) : null;
        valid.push({
          type: "task", name: r.name, description: r.description,
          taskStatus: r.statusName ? statusMap.get(r.statusName.toLowerCase()) || null : null,
          assignee: assigneeId, project: projectId, company: req.user.companyId,
          dueDate: deadline, calculatedDeadline: deadline,
          requiredHours: r.hours || null, estimatedHours: r.hours || 0, media: [],
        });
      }

      if (!valid.length) return res.status(200).json({ created: 0, message: "No new valid rows." });
      const inserted = await Task.insertMany(valid, { ordered: false });
      await emit("tasks:bulkCreated", { count: inserted.length });
      res.status(201).json({ created: inserted.length });
    } catch (err) { res.status(500).json({ error: "Bulk upload failed", details: err.message }); }
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // ISSUES CRUD
  // ══════════════════════════════════════════════════════════════════════════════

  export const getIssues = async (req, res) => {
    try {
      const issues = await Task.find({ type: "issue", company: req.user.companyId })
        .populate(populate).sort({ createdAt: -1 });
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
        company:    req.user.companyId,
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
        data, { new: true, runValidators: false }
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

  export const bulkCreateIssues = async (req, res) => {
    try {
      const rows = req.body.issues;
      if (!Array.isArray(rows) || rows.length === 0)
        return res.status(400).json({ error: "No rows provided." });

      const [allStaff, allStatuses, existing] = await Promise.all([
        Staff.find({ company: req.user.companyId }, { name: 1 }).lean(),
        TaskStatus.find({}, { name: 1 }).lean(),
        Task.find({ company: req.user.companyId, name: { $in: rows.map(r => r.name) }, type: "issue" }, { name: 1 }).lean(),
      ]);

      const staffMap    = new Map(allStaff.map(s => [s.name.toLowerCase(), s._id]));
      const statusMap   = new Map(allStatuses.map(s => [s.name.toLowerCase(), s._id]));
      const existingSet = new Set(existing.map(e => e.name.toLowerCase()));
      const projectId   = toObjectId(req.body.project);

      const valid = []; const unmatched = [];
      for (const r of rows) {
        if (!r.name || !r.assigneeName || existingSet.has(r.name.toLowerCase())) continue;
        const assigneeId = staffMap.get(r.assigneeName.toLowerCase());
        if (!assigneeId) { unmatched.push(r.assigneeName); continue; }
        valid.push({
          type: "issue", name: r.name, description: r.description || "",
          taskStatus: r.statusName ? statusMap.get(r.statusName.toLowerCase()) || null : null,
          assignee: assigneeId, project: projectId, company: req.user.companyId,
          priority: r.priority || "medium", severity: r.severity || "minor",
          issueType: "bug", dueDate: r.dueDate || null,
        });
      }

      const inserted = await Task.insertMany(valid, { ordered: false });
      await emit("issues:bulkCreated", { count: inserted.length });
      res.status(201).json({
        created: inserted.length, failed: rows.length - inserted.length,
        duplicates: 0, unmatchedAssignees: [...new Set(unmatched)].slice(0, 10),
      });
    } catch (err) { res.status(500).json({ error: "Bulk upload failed", details: err.message }); }
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // OWNER — All tasks + issues for their own company
  // GET /task/owner/all
  // ══════════════════════════════════════════════════════════════════════════════
  export const getOwnerAllTasks = async (req, res) => {
    try {
      const companyId = req.user.companyId;
      if (!companyId) return res.status(400).json({ message: "No company associated" });

      const { search, status, assignee, type = "all", project } = req.query;

      const filter = { company: toObjectId(companyId) };
      if (type !== "all") filter.type = type;
      if (status)   { const s = toObjectId(status);   if (s) filter.taskStatus = s; }
      if (assignee) { const a = toObjectId(assignee);  if (a) filter.assignee   = a; }
      if (project)  { const p = toObjectId(project);   if (p) filter.project    = p; }
      if (search)   filter.name = { $regex: search.trim(), $options: "i" };

      const [tasks, allStaff, allStatuses] = await Promise.all([
        Task.find(filter)
          .populate({ path: "taskStatus", select: "name color" })
          .populate({ path: "assignee",   select: "name email" })
          .populate({ path: "project",    select: "name" })
          .sort({ createdAt: -1 })
          .lean(),
        Staff.find({ company: toObjectId(companyId) }, { name: 1, email: 1 }).lean(),
        TaskStatus.find({ status: "ACTIVE" }, { name: 1 }).lean(),
      ]);

      const taskCount    = tasks.filter(t => t.type !== "issue").length;
      const issueCount   = tasks.filter(t => t.type === "issue").length;
      const overdueCount = tasks.filter(t => {
        const d = t.dueDate || t.calculatedDeadline;
        return d && new Date(d) < new Date();
      }).length;

      // Status breakdown for chart
      const statusBreakdown = {};
      tasks.forEach(t => {
        const name = t.taskStatus?.name || "No Status";
        statusBreakdown[name] = (statusBreakdown[name] || 0) + 1;
      });

      res.json({
        total: tasks.length, taskCount, issueCount, overdueCount,
        statusBreakdown, tasks,
        staffList:  allStaff,
        statusList: allStatuses,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch company tasks", details: err.message });
    }
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // SUPERADMIN — All tasks across ALL companies
  // GET /task/super/all
  // ══════════════════════════════════════════════════════════════════════════════
  export const getAllTasksSuperAdmin = async (req, res) => {
    try {
      const { search, company, status, assignee, type = "all" } = req.query;

      const filter = {};
      if (type !== "all") filter.type = type;
      if (company)  { const c = toObjectId(company);  if (c) filter.company    = c; }
      if (status)   { const s = toObjectId(status);   if (s) filter.taskStatus = s; }
      if (assignee) { const a = toObjectId(assignee);  if (a) filter.assignee   = a; }
      if (search)   filter.name = { $regex: search.trim(), $options: "i" };

      const [tasks, allCompanies, allStatuses] = await Promise.all([
        Task.find(filter)
          .populate({ path: "company",    select: "name email logo" })
          .populate({ path: "taskStatus", select: "name color" })
          .populate({ path: "assignee",   select: "name email" })
          .populate({ path: "project",    select: "name" })
          .sort({ createdAt: -1 })
          .lean(),
        Company.find({ status: { $ne: 0 } }, { name: 1, email: 1, logo: 1 }).lean(),
        TaskStatus.find({ status: "ACTIVE" }, { name: 1 }).lean(),
      ]);

      // Group by company
      const grouped = {};
      for (const task of tasks) {
        const cid = task.company?._id?.toString() || "unknown";
        if (!grouped[cid]) {
          grouped[cid] = {
            company:      task.company || { _id: "unknown", name: "Unknown Company" },
            tasks:        [],
            taskCount:    0,
            issueCount:   0,
            overdueCount: 0,
          };
        }
        grouped[cid].tasks.push(task);
        if (task.type === "issue") grouped[cid].issueCount++;
        else grouped[cid].taskCount++;
        const d = task.dueDate || task.calculatedDeadline;
        if (d && new Date(d) < new Date()) grouped[cid].overdueCount++;
      }

      const result = Object.values(grouped).sort((a, b) =>
        (a.company?.name || "").localeCompare(b.company?.name || "")
      );

      const totalOverdue = tasks.filter(t => {
        const d = t.dueDate || t.calculatedDeadline;
        return d && new Date(d) < new Date();
      }).length;

      res.json({
        total:       tasks.length,
        totalTasks:  tasks.filter(t => t.type !== "issue").length,
        totalIssues: tasks.filter(t => t.type === "issue").length,
        totalOverdue,
        companies:   result.length,
        grouped:     result,
        companyList: allCompanies,
        statusList:  allStatuses,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch all tasks", details: err.message });
    }
  };