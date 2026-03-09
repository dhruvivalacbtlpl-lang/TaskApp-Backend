// controllers/taskController.js
import Task from "../models/Task.js";
import { sendTaskMail, sendIssueMail } from "../services/mail.js";

const getIO = async () => {
  const mod = await import("../../server.js");
  return mod.io;
};

const populate = [
  { path: "taskStatus" },
  { path: "assignee", select: "name email" },
  { path: "project", select: "name" },
];

const getMediaPaths = (files = []) =>
  files.map((f) => f.path.replace(/\\/g, "/"));

// ─── TASKS ───────────────────────────────────────────────────────────────────

export const getTasks = async (req, res) => {
  try {
    const tasks = await Task.find({
      $or: [{ type: "task" }, { type: { $exists: false } }, { type: null }],
    })
      .populate(populate)
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    console.error("❌ getTasks:", err.message);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
};

export const getTaskById = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id).populate(populate);
    if (!task) return res.status(404).json({ error: "Not found" });
    res.json(task);
  } catch (err) {
    console.error("❌ getTaskById:", err.message);
    res.status(500).json({ error: "Failed to fetch task" });
  }
};

export const createTask = async (req, res) => {
  try {
    const { name, description, taskStatus, assignee, project } = req.body;

    if (!name || !description || !assignee) {
      return res.status(400).json({ error: "name, description, and assignee are required" });
    }

    const task = await Task.create({
      type: "task",
      name,
      description,
      taskStatus: taskStatus || null,
      assignee,
      project: project || null,
      media: getMediaPaths(req.files),
      // ✅ Do NOT pass priority/issueType/severity for tasks — they are issue-only fields
      // If somehow sent, ignore them (don't spread req.body)
    });

    const populated = await Task.findById(task._id).populate(populate);

    try {
      const io = await getIO();
      io.emit("task:created", populated);
    } catch (ioErr) {
      console.error("⚠️ Socket emit failed (non-fatal):", ioErr.message);
    }

    try {
      if (populated.assignee?.email) {
        await sendTaskMail({
          email: populated.assignee.email,
          taskName: populated.name,
          description: populated.description || "—",
          status: populated.taskStatus?.name || "—",
          assignedBy: "Admin",
        });
      }
    } catch (mailErr) {
      console.error("⚠️ Task mail failed (non-fatal):", mailErr.message);
    }

    res.status(201).json(populated);
  } catch (err) {
    console.error("❌ createTask:", err.name, "-", err.message);
    res.status(500).json({ error: "Failed to create task", details: err.message });
  }
};

export const updateTask = async (req, res) => {
  try {
    const updateData = { ...req.body };

    if (updateData.project === "") updateData.project = null;
    if (updateData.assignee === "") updateData.assignee = null;
    if (updateData.taskStatus === "") updateData.taskStatus = null;

    // ✅ Remove issue-only enum fields to avoid enum validation errors
    delete updateData.priority;
    delete updateData.issueType;
    delete updateData.severity;

    if (req.files?.length) {
      updateData.media = getMediaPaths(req.files);
    }

    const task = await Task.findByIdAndUpdate(
      req.params.id, updateData, { new: true, runValidators: false }
    ).populate(populate);

    if (!task) return res.status(404).json({ error: "Task not found" });

    try {
      const io = await getIO();
      io.emit("task:updated", task);
    } catch (ioErr) {
      console.error("⚠️ Socket emit failed (non-fatal):", ioErr.message);
    }

    try {
      if (task.assignee?.email) {
        await sendTaskMail({
          email: task.assignee.email,
          taskName: task.name,
          description: task.description || "—",
          status: task.taskStatus?.name || "—",
          assignedBy: "Admin",
        });
      }
    } catch (mailErr) {
      console.error("⚠️ Task update mail failed (non-fatal):", mailErr.message);
    }

    res.json(task);
  } catch (err) {
    console.error("❌ updateTask:", err.message);
    res.status(500).json({ error: "Failed to update task", details: err.message });
  }
};

export const deleteTask = async (req, res) => {
  try {
    await Task.findByIdAndDelete(req.params.id);

    try {
      const io = await getIO();
      io.emit("task:deleted", { _id: req.params.id });
    } catch (ioErr) {
      console.error("⚠️ Socket emit failed (non-fatal):", ioErr.message);
    }

    res.json({ message: "Deleted" });
  } catch (err) {
    console.error("❌ deleteTask:", err.message);
    res.status(500).json({ error: "Failed to delete task" });
  }
};

// ─── BULK CREATE TASKS ────────────────────────────────────────────────────────

export const bulkCreateTasks = async (req, res) => {
  try {
    const { tasks, project } = req.body;

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: "tasks array is required and must not be empty" });
    }

    const results  = [];
    const failures = [];

    for (const t of tasks) {
      try {
        if (!t.name || !t.description || !t.assignee) {
          failures.push({
            task: t.name || "(unnamed)",
            reason: "name, description, and assignee are required",
          });
          continue;
        }

        const created = await Task.create({
          type:        "task",
          name:        t.name,
          description: t.description,
          taskStatus:  t.taskStatus || null,
          assignee:    t.assignee,
          project:     project || t.project || null,
          media:       [],
          // ✅ No issue-only fields
        });

        const populated = await Task.findById(created._id).populate(populate);
        results.push(populated);

        try {
          const io = await getIO();
          io.emit("task:created", populated);
        } catch (ioErr) {
          console.error("⚠️ Socket emit failed (non-fatal):", ioErr.message);
        }

        try {
          if (populated.assignee?.email) {
            await sendTaskMail({
              email:       populated.assignee.email,
              taskName:    populated.name,
              description: populated.description || "—",
              status:      populated.taskStatus?.name || "—",
              assignedBy:  "Admin",
            });
          }
        } catch (mailErr) {
          console.error("⚠️ Bulk task mail failed (non-fatal):", mailErr.message);
        }
      } catch (taskErr) {
        failures.push({ task: t.name || "(unnamed)", reason: taskErr.message });
      }
    }

    res.status(201).json({
      created:  results.length,
      failed:   failures.length,
      results,
      failures,
    });
  } catch (err) {
    console.error("❌ bulkCreateTasks:", err.message);
    res.status(500).json({ error: "Bulk create failed", details: err.message });
  }
};

// ─── ISSUES ──────────────────────────────────────────────────────────────────

export const getIssues = async (req, res) => {
  try {
    const issues = await Task.find({ type: "issue" })
      .populate(populate)
      .sort({ createdAt: -1 });
    res.json(issues);
  } catch (err) {
    console.error("❌ getIssues:", err.message);
    res.status(500).json({ error: "Failed to fetch issues" });
  }
};

export const createIssue = async (req, res) => {
  try {
    const {
      name, description, taskStatus, assignee,
      project, priority, issueType, severity, dueDate,
    } = req.body;

    if (!name || !description || !assignee) {
      return res.status(400).json({ error: "name, description, and assignee are required" });
    }

    const issue = await Task.create({
      type: "issue",
      name,
      description,
      taskStatus: taskStatus || null,
      assignee,
      project: project || null,
      media: getMediaPaths(req.files),
      ...(priority  && { priority }),
      ...(issueType && { issueType }),
      ...(severity  && { severity }),
      ...(dueDate   && { dueDate }),
    });

    const populated = await Task.findById(issue._id).populate(populate);

    try {
      const io = await getIO();
      io.emit("issue:created", populated);
    } catch (ioErr) {
      console.error("⚠️ Socket emit failed (non-fatal):", ioErr.message);
    }

    try {
      if (populated.assignee?.email) {
        await sendIssueMail({
          email:        populated.assignee.email,
          assigneeName: populated.assignee.name,
          issueName:    populated.name,
          description:  populated.description || "—",
          issueType:    populated.issueType,
          priority:     populated.priority,
          severity:     populated.severity,
          status:       populated.taskStatus?.name || "—",
          project:      populated.project?.name || null,
          dueDate:      populated.dueDate || null,
          assignedBy:   "Admin",
        });
      }
    } catch (mailErr) {
      console.error("⚠️ Issue mail failed (non-fatal):", mailErr.message);
    }

    res.status(201).json(populated);
  } catch (err) {
    console.error("❌ createIssue:", err.name, "-", err.message);
    res.status(500).json({ error: "Failed to create issue", details: err.message });
  }
};

export const updateIssue = async (req, res) => {
  try {
    const updateData = { ...req.body };

    if (updateData.project === "") updateData.project = null;
    if (updateData.assignee === "") updateData.assignee = null;
    if (updateData.taskStatus === "") updateData.taskStatus = null;

    if (!updateData.priority)  delete updateData.priority;
    if (!updateData.issueType) delete updateData.issueType;
    if (!updateData.severity)  delete updateData.severity;

    if (req.files?.length) {
      updateData.media = getMediaPaths(req.files);
    }

    const issue = await Task.findByIdAndUpdate(
      req.params.id, updateData, { new: true, runValidators: false }
    ).populate(populate);

    if (!issue) return res.status(404).json({ error: "Issue not found" });

    try {
      const io = await getIO();
      io.emit("issue:updated", issue);
    } catch (ioErr) {
      console.error("⚠️ Socket emit failed (non-fatal):", ioErr.message);
    }

    try {
      if (issue.assignee?.email) {
        await sendIssueMail({
          email:        issue.assignee.email,
          assigneeName: issue.assignee.name,
          issueName:    issue.name,
          description:  issue.description || "—",
          issueType:    issue.issueType,
          priority:     issue.priority,
          severity:     issue.severity,
          status:       issue.taskStatus?.name || "—",
          project:      issue.project?.name || null,
          dueDate:      issue.dueDate || null,
          assignedBy:   "Admin",
        });
      }
    } catch (mailErr) {
      console.error("⚠️ Issue update mail failed (non-fatal):", mailErr.message);
    }

    res.json(issue);
  } catch (err) {
    console.error("❌ updateIssue:", err.message);
    res.status(500).json({ error: "Failed to update issue", details: err.message });
  }
};