import Task from "../models/Task.js";
import Staff from "../models/Staff.js";
import TaskStatus from "../models/TaskStatus.js";
import { sendTaskMail } from "../utils/mail.js";

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

    // 🔹 Get logged-in user name
    const loggedUser = await Staff.findById(req.user.id);

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
    const { id } = req.params;
    const { name, description, assignee, taskStatus } = req.body;

    const existingTask = await Task.findById(id).populate("assignee");

    if (!existingTask) {
      return res.status(404).json({ message: "Task not found" });
    }

    const oldAssignee = existingTask.assignee?._id?.toString();

    existingTask.name = name;
    existingTask.description = description;
    existingTask.assignee = assignee;
    existingTask.taskStatus = taskStatus;

    await existingTask.save();

    const updatedTask = await Task.findById(id)
      .populate("assignee")
      .populate("taskStatus");

    // 🔹 Get logged-in user name
    const loggedUser = await Staff.findById(req.user.id);

    /* 🔹 IF ASSIGNEE CHANGED → SEND EMAIL */
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
