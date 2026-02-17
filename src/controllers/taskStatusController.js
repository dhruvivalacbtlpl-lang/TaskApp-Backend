import TaskStatus from "../models/TaskStatus.js";

// GET all task statuses
export const getTaskStatuses = async (req, res) => {
  try {
    const statuses = await TaskStatus.find();
    res.json(statuses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET single task status
export const getTaskStatus = async (req, res) => {
  try {
    const status = await TaskStatus.findById(req.params.id);
    if (!status) return res.status(404).json({ error: "Task status not found" });
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// CREATE task status
export const createTaskStatus = async (req, res) => {
  try {
    const { name, status } = req.body;
    const newStatus = await TaskStatus.create({ name, status });
    res.status(201).json(newStatus);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// UPDATE task status
export const updateTaskStatus = async (req, res) => {
  try {
    const { name, status } = req.body;
    const updatedStatus = await TaskStatus.findByIdAndUpdate(
      req.params.id,
      { name, status },
      { new: true }
    );
    if (!updatedStatus) return res.status(404).json({ error: "Task status not found" });
    res.json(updatedStatus);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE task status
export const deleteTaskStatus = async (req, res) => {
  try {
    const deletedStatus = await TaskStatus.findByIdAndDelete(req.params.id);
    if (!deletedStatus) return res.status(404).json({ error: "Task status not found" });
    res.json({ message: "Task status deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
    