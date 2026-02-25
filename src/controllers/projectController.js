// controllers/projectController.js
import Project from "../models/Project.js";
import { io } from "../../server.js";
import { sendProjectMail } from "../services/mail.js";

export const getProjects = async (req, res) => {
  try {
    const projects = await Project.find().populate("members", "name email");
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch projects" });
  }
};

export const getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).populate("members", "name email");
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch project" });
  }
};

export const createProject = async (req, res) => {
  try {
    const { name, description, status, members, startDate, endDate } = req.body;
    if (!name) return res.status(400).json({ error: "Project name is required" });

    const project = await Project.create({ name, description, status, members, startDate, endDate });
    const populated = await Project.findById(project._id).populate("members", "name email");

    io.emit("project:created", populated);

    // ✅ Send mail to every member — non-fatal
    try {
      if (populated.members?.length) {
        await Promise.allSettled(
          populated.members.map((member) =>
            sendProjectMail({
              email: member.email,
              memberName: member.name,
              projectName: populated.name,
              description: populated.description || "—",
              status: populated.status || "—",
              startDate: populated.startDate || null,
              endDate: populated.endDate || null,
              assignedBy: "Admin",
            })
          )
        );
      }
    } catch (mailErr) {
      console.error("⚠️ Project create mail failed (non-fatal):", mailErr.message);
    }

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: "Failed to create project" });
  }
};

export const updateProject = async (req, res) => {
  try {
    const { name, description, status, members, startDate, endDate } = req.body;

    // Grab old members so we only mail newly added ones
    const oldProject = await Project.findById(req.params.id).populate("members", "name email");
    const oldMemberIds = new Set((oldProject?.members || []).map((m) => m._id.toString()));

    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { name, description, status, members, startDate, endDate },
      { new: true }
    ).populate("members", "name email");

    io.emit("project:updated", project);

    // ✅ Only mail newly added members — non-fatal
    try {
      const newMembers = (project.members || []).filter(
        (m) => !oldMemberIds.has(m._id.toString())
      );
      if (newMembers.length) {
        await Promise.allSettled(
          newMembers.map((member) =>
            sendProjectMail({
              email: member.email,
              memberName: member.name,
              projectName: project.name,
              description: project.description || "—",
              status: project.status || "—",
              startDate: project.startDate || null,
              endDate: project.endDate || null,
              assignedBy: "Admin",
            })
          )
        );
      }
    } catch (mailErr) {
      console.error("⚠️ Project update mail failed (non-fatal):", mailErr.message);
    }

    res.json(project);
  } catch (err) {
    res.status(500).json({ error: "Failed to update project" });
  }
};

export const deleteProject = async (req, res) => {
  try {
    await Project.findByIdAndDelete(req.params.id);
    io.emit("project:deleted", { _id: req.params.id });
    res.json({ message: "Project deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete project" });
  }
};