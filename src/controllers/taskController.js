// controllers/taskController.js
import Task from "../models/Task.js";
import { io } from "../../server.js";

const populate = [
  { path: "taskStatus" },
  { path: "assignee", select: "name email" },
  { path: "project", select: "name" },
];

// ─── TASKS ───────────────────────────────────────────

export const getTasks = async (req, res) => {
  try {
    const tasks = await Task.find({ 
      $or: [{ type: "task" }, { type: { $exists: false } }, { type: null }]
    })
      .populate(populate)
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
};
export const getTaskById = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id).populate(populate);
    if (!task) return res.status(404).json({ error: "Not found" });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch task" });
  }
};

export const createTask = async (req, res) => {
  try {
    const { name, description, taskStatus, assignee, project, media } = req.body;
    const task = await Task.create({
      type: "task",
      name, description, taskStatus, assignee, project, media,
    });
    const populated = await Task.findById(task._id).populate(populate);
    io.emit("task:created", populated);
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: "Failed to create task" });
  }
};

export const updateTask = async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(
      req.params.id, req.body, { new: true }
    ).populate(populate);
    io.emit("task:updated", task);
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: "Failed to update task" });
  }
};

export const deleteTask = async (req, res) => {
  try {
    await Task.findByIdAndDelete(req.params.id);
    io.emit("task:deleted", { _id: req.params.id });
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete task" });
  }
};

// ─── ISSUES ──────────────────────────────────────────

export const getIssues = async (req, res) => {
  try {
    const issues = await Task.find({ type: "issue" })
      .populate(populate)
      .sort({ createdAt: -1 });
    res.json(issues);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch issues" });
  }
};

export const createIssue = async (req, res) => {
  try {
    const {
      name, description, taskStatus, assignee,
      project, media, priority, issueType, severity, dueDate,
    } = req.body;
    const issue = await Task.create({
      type: "issue",
      name, description, taskStatus, assignee,
      project, media, priority, issueType, severity, dueDate,
    });
    const populated = await Task.findById(issue._id).populate(populate);
    io.emit("issue:created", populated);
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: "Failed to create issue" });
  }
};