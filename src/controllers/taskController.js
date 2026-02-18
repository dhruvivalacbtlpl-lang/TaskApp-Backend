import Task from "../models/Task.js";
import Staff from "../models/Staff.js";
import { sendTaskMail } from "../services/mail.js";

/* ================= GET ALL TASKS ================= */
export const getTasks = async (req, res) => {
  try {
    const tasks = await Task.find()
      .populate("assignee")
      .populate("taskStatus");

    res.json(tasks);
  } catch (error) {
    console.error("Get Tasks Error:", error);
    res.status(500).json({ message: "Error fetching tasks" });
  }
};

/* ================= GET SINGLE TASK ================= */
export const getTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate("assignee")
      .populate("taskStatus");

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json(task);
  } catch (error) {
    console.error("Get Task Error:", error);
    res.status(500).json({ message: "Error fetching task" });
  }
};

/* ================= CREATE TASK ================= */
export const createTask = async (req, res) => {
  try {
    const { name, description, assignee, taskStatus } = req.body;

    const newTask = await Task.create({
      name,
      description,
      assignee,
      taskStatus,
    });

    const populatedTask = await Task.findById(newTask._id)
      .populate("assignee")
      .populate("taskStatus");

    const loggedUser = await Staff.findById(req.user?.id);

    if (populatedTask.assignee?.email) {
      await sendTaskMail({
        email: populatedTask.assignee.email,
        taskName: populatedTask.name,
        description: populatedTask.description,
        status: populatedTask.taskStatus?.name,
        assignedBy: loggedUser?.name || "Admin",
      });
    }

    res.status(201).json(newTask);
  } catch (error) {
    console.error("Create Task Error:", error);
    res.status(500).json({ message: "Error creating task" });
  }
};

/* ================= UPDATE TASK ================= */
export const updateTask = async (req, res) => {
  try {
    const { name, description, assignee, taskStatus } = req.body;

    const existingTask = await Task.findById(req.params.id)
      .populate("assignee");

    if (!existingTask) {
      return res.status(404).json({ message: "Task not found" });
    }

    const oldAssignee = existingTask.assignee?._id?.toString();

    existingTask.name = name;
    existingTask.description = description;
    existingTask.assignee = assignee;
    existingTask.taskStatus = taskStatus;

    await existingTask.save();

    const updatedTask = await Task.findById(req.params.id)
      .populate("assignee")
      .populate("taskStatus");

    const loggedUser = await Staff.findById(req.user?.id);

    /* 🔹 SEND MAIL ONLY IF ASSIGNEE CHANGED */
    if (
      assignee &&
      assignee !== oldAssignee &&
      updatedTask.assignee?.email
    ) {
      await sendTaskMail({
        email: updatedTask.assignee.email,
        taskName: updatedTask.name,
        description: updatedTask.description,
        status: updatedTask.taskStatus?.name,
        assignedBy: loggedUser?.name || "Admin",
      });
    }

    res.json(updatedTask);
  } catch (error) {
    console.error("Update Task Error:", error);
    res.status(500).json({ message: "Error updating task" });
  }
};

/* ================= DELETE TASK ================= */
export const deleteTask = async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json({ message: "Task deleted successfully" });
  } catch (error) {
    console.error("Delete Task Error:", error);
    res.status(500).json({ message: "Error deleting task" });
  }
};
