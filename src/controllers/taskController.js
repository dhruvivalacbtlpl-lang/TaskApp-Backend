import Task from "../models/Task.js";
import { io } from "../../server.js"; // ✅ import socket instance

const clean = (v) => (Array.isArray(v) ? v[0] : v)?.trim();

function getMediaPath(file) {
  if (!file) return null;
  if (file.mimetype.startsWith("video/")) return `/uploads/videos/${file.filename}`;
  return `/uploads/images/${file.filename}`;
}

/* ================= GET ALL ================= */
export const getTasks = async (req, res) => {
  const tasks = await Task.find().populate("assignee taskStatus");
  res.json(tasks);
};

/* ================= GET ONE ================= */
export const getTask = async (req, res) => {
  const task = await Task.findById(req.params.id).populate("assignee taskStatus");
  if (!task) return res.status(404).json({ message: "Task not found" });
  res.json(task);
};

/* ================= CREATE ================= */
export const createTask = async (req, res) => {
  const task = await Task.create({
    name: clean(req.body.name),
    description: clean(req.body.description),
    assignee: clean(req.body.assignee),
    taskStatus: clean(req.body.taskStatus),
    media: getMediaPath(req.file),
  });

  const populated = await task.populate("assignee taskStatus");

  // ✅ Emit to ALL connected clients
  io.emit("task:created", populated);

  // ✅ Notify assigned user specifically
  if (populated.assignee?._id) {
    io.emit("notification", {
      userId: populated.assignee._id.toString(),
      message: `📋 You have been assigned: "${populated.name}"`,
    });
  }

  res.status(201).json(populated);
};

/* ================= UPDATE ================= */
export const updateTask = async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: "Task not found" });

  task.name = clean(req.body.name) || task.name;
  task.description = clean(req.body.description) || task.description;
  task.assignee = clean(req.body.assignee) || task.assignee;
  task.taskStatus = clean(req.body.taskStatus) || task.taskStatus;
  if (req.file) task.media = getMediaPath(req.file);

  await task.save();
  const populated = await task.populate("assignee taskStatus");

  // ✅ Emit update to all clients
  io.emit("task:updated", populated);

  res.json(populated);
};

/* ================= DELETE ================= */
export const deleteTask = async (req, res) => {
  await Task.findByIdAndDelete(req.params.id);

  // ✅ Emit delete — frontend removes it from list instantly
  io.emit("task:deleted", { _id: req.params.id });

  res.json({ message: "Task deleted" });
};