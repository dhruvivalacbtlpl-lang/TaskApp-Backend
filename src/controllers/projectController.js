import Project from "../models/Project.js";
import { io } from "../../server.js";

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
    const { name, description, status, members } = req.body;
    if (!name) return res.status(400).json({ error: "Project name is required" });

    const project = await Project.create({ name, description, status, members });
    const populated = await Project.findById(project._id).populate("members", "name email");

    io.emit("project:created", populated);
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: "Failed to create project" });
  }
};

export const updateProject = async (req, res) => {
  try {
    const { name, description, status, members } = req.body;
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { name, description, status, members },
      { new: true }
    ).populate("members", "name email");

    io.emit("project:updated", project);
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