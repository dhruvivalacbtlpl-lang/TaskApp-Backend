import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    category: {
      type:    String,
      enum:    ["task", "issue"],
      default: "task",
      index:   true,
    },

    name:        { type: String, required: true, trim: true },
    description: { type: String, default: "" },

    taskStatus: { type: mongoose.Schema.Types.ObjectId, ref: "TaskStatus", default: null },
    assignee:   { type: mongoose.Schema.Types.ObjectId, ref: "Staff",      default: null },
    project:    { type: mongoose.Schema.Types.ObjectId, ref: "Project",    default: null },

    media: [
      {
        url:          { type: String },
        originalName: { type: String },
        mimetype:     { type: String },
        size:         { type: Number },
      },
    ],

    // ── Issue-only fields ─────────────────────────────────────────────────────
    priority:  { type: String, default: null },
    issueType: { type: String, default: null },
    severity:  { type: String, default: null },

    dueDate:     { type: Date, default: null },
    createdDate: { type: Date, default: Date.now },

    // ── NEW: Company working-hours deadline ───────────────────────────────────
    requiredHours:      { type: Number, default: null }, // hours user inputs
    calculatedDeadline: { type: Date,   default: null }, // auto-calculated
  },
  { timestamps: true }
);

export default mongoose.models.Task || mongoose.model("Task", taskSchema);