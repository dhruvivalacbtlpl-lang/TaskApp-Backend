import Task from "../models/Task.js";
import { io } from "../../server.js";

const clean = (v) => (Array.isArray(v) ? v[0] : v)?.trim();

function getMediaPath(file) {
  if (!file) return null;
  if (file.mimetype.startsWith("video/")) return `/uploads/videos/${file.filename}`;
  return `/uploads/images/${file.filename}`;
}

/* ================= GET ALL ================= */
export const getTasks = async (req, res) => {
  try {
    const tasks = await Task.find().populate("assignee taskStatus");
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: "Error fetching tasks" });
  }
};

/* ================= GET ONE ================= */
export const getTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id).populate("assignee taskStatus");
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.json(task);
  } catch (err) {
    res.status(500).json({ message: "Error fetching task" });
  }
};

/* ================= CREATE ================= */
export const createTask = async (req, res) => {
  try {
    // ✅ map each file individually
    const mediaPaths = req.files && req.files.length > 0
      ? req.files.map(getMediaPath)
      : [];

    const task = await Task.create({
      name: clean(req.body.name),
      description: clean(req.body.description),
      assignee: clean(req.body.assignee),
      taskStatus: clean(req.body.taskStatus),
      media: mediaPaths,
    });

    const populated = await task.populate("assignee taskStatus");

    io.emit("task:created", populated);

    if (populated.assignee?._id) {
      io.emit("notification", {
        userId: populated.assignee._id.toString(),
        message: `📋 You have been assigned: "${populated.name}"`,
      });
    }

    res.status(201).json(populated);
  } catch (err) {
    console.error("Create Task Error:", err);
    res.status(500).json({ message: "Error creating task" });
  }
};

/* ================= UPDATE ================= */
export const updateTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });

    task.name = clean(req.body.name) || task.name;
    task.description = clean(req.body.description) || task.description;
    task.assignee = clean(req.body.assignee) || task.assignee;
    task.taskStatus = clean(req.body.taskStatus) || task.taskStatus;

    // ✅ map each file individually
    if (req.files && req.files.length > 0) {
      task.media = req.files.map(getMediaPath);
    }

    await task.save();
    const populated = await task.populate("assignee taskStatus");

    io.emit("task:updated", populated);

    res.json(populated);
  } catch (err) {
    console.error("Update Task Error:", err);
    res.status(500).json({ message: "Error updating task" });
  }
};

/* ================= DELETE ================= */
export const deleteTask = async (req, res) => {
  try {
    await Task.findByIdAndDelete(req.params.id);
    io.emit("task:deleted", { _id: req.params.id });
    res.json({ message: "Task deleted" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting task" });
  }
};