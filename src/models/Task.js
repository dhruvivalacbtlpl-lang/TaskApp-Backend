import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    // Keeping both for backward compatibility
    type: {
      type: String,
      enum: ["task", "issue"],
      default: "task",
      index: true,
    },
    category: {
      type: String,
      enum: ["task", "issue"],
      default: "task",
      index: true,
    },

    name:        { type: String, required: true, trim: true },
    description: { type: String, default: "" },

    // Multi-company isolation
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      index: true,
    },

    taskStatus: { type: mongoose.Schema.Types.ObjectId, ref: "TaskStatus", default: null },
    assignee:   { type: mongoose.Schema.Types.ObjectId, ref: "Staff",      default: null },
    project:    { type: mongoose.Schema.Types.ObjectId, ref: "Project",    default: null },

    media: [
      {
        url:          { type: String },
        originalName: { type: String },
        mimetype:     { type: String },
        size:         { type: Number },
        path:         { type: String },
      },
    ],

    // Issue-only fields
    priority:  { type: String, default: null },
    issueType: { type: String, default: null },
    severity:  { type: String, default: null },

    // Dates
    dueDate:     { type: Date, default: null },
    createdDate: { type: Date, default: Date.now },

    // Working hours deadline fields
    estimatedHours:     { type: Number, default: null }, // old — kept for compatibility
    requiredHours:      { type: Number, default: null }, // new — from frontend
    calculatedDeadline: { type: Date,   default: null }, // auto-calculated
  },
  { timestamps: true }
);

export default mongoose.models.Task || mongoose.model("Task", taskSchema);