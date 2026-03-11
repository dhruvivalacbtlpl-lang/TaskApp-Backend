// models/Task.js
import mongoose from "mongoose";

const TaskSchema = new mongoose.Schema(
  {
    // "task" or "issue" — visible in DB as category
    category: {
      type: String,
      enum: ["task", "issue"],
      required: true,
      index: true,
    },

    // ── Shared fields ─────────────────────────────────────────────────────
    name:        { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    taskStatus:  { type: mongoose.Schema.Types.ObjectId, ref: "TaskStatus", default: null },
    assignee:    { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
    project:     { type: mongoose.Schema.Types.ObjectId, ref: "Project", default: null },
    media:       { type: [String], default: [] },
    createdDate: { type: Date, default: Date.now },

    // ── Issue-only fields (null for tasks) ────────────────────────────────
    priority:  { type: String, enum: ["low", "medium", "high", "critical"], default: null },
    issueType: { type: String, enum: ["bug", "feature", "improvement"], default: null },
    severity:  { type: String, enum: ["minor", "moderate", "major", "critical"], default: null },
    dueDate:   { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: "tasks", // both tasks & issues in ONE collection
  }
);

// Prevent duplicate name per category per project
TaskSchema.index({ name: 1, category: 1, project: 1 }, { unique: true, sparse: true });

export default mongoose.models.Task || mongoose.model("Task", TaskSchema);