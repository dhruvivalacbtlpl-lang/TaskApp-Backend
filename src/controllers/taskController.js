import Task from "../models/Task.js";

const clean = (v) => (Array.isArray(v) ? v[0] : v)?.trim();

// ✅ Detects correct folder based on mimetype
function getMediaPath(file) {
  if (!file) return null;
  if (file.mimetype.startsWith("video/")) {
    return `/uploads/videos/${file.filename}`;
  }
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
    media: getMediaPath(req.file), // ✅ /uploads/images/x.jpg OR /uploads/videos/x.mp4
  });
  res.status(201).json(task);
};

/* ================= UPDATE ================= */
export const updateTask = async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: "Task not found" });

  task.name = clean(req.body.name) || task.name;
  task.description = clean(req.body.description) || task.description;
  task.assignee = clean(req.body.assignee) || task.assignee;
  task.taskStatus = clean(req.body.taskStatus) || task.taskStatus;

  if (req.file) {
    task.media = getMediaPath(req.file); // ✅ correct path for image or video
  }

  await task.save();
  res.json(task);
};

/* ================= DELETE ================= */
export const deleteTask = async (req, res) => {
  await Task.findByIdAndDelete(req.params.id);
  res.json({ message: "Task deleted" });
};
