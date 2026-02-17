// backend/src/controllers/taskController.js
import Task from "../models/Task.js";
import Staff from "../models/Staff.js";

// GET all tasks
export const getTasks = async (req, res) => {
  try {
    const tasks = await Task.find()
      .populate("assignee", "name email")
      .populate("taskStatus", "name")
      .populate("status", "name");
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET single task
export const getTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate("assignee", "name email")
      .populate("taskStatus", "name")
      .populate("status", "name");
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// CREATE task
export const createTask = async (req, res) => {
  try {
    const { name, description, taskStatus, status, assignee } = req.body;
    const task = await Task.create({ name, description, taskStatus, status, assignee });
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// UPDATE task
export const updateTask = async (req, res) => {
  try {
    const { name, description, taskStatus, status, assignee } = req.body;
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      { name, description, taskStatus, status, assignee },
      { new: true }
    );
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE task
export const deleteTask = async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json({ message: "Task deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
