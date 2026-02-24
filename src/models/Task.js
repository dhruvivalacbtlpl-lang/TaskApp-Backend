// models/Task.js
import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["task", "issue"],
      default: "task",
    },
    name: { type: String, required: true },
    description: { type: String, required: true },
    taskStatus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TaskStatus",
    },
    assignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },
    media: [String],

    // Issue-only fields (null for tasks)
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: null,
    },
    issueType: {
      type: String,
      enum: ["bug", "feature", "improvement"],
      default: null,
    },
    severity: {
      type: String,
      enum: ["minor", "moderate", "major", "critical"],
      default: null,
    },
    dueDate: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Task", taskSchema);