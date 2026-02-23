import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
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
      default: null, // ✅ optional — tasks can exist without a project
    },
    media: [String],
  },
  { timestamps: true }
);

export default mongoose.model("Task", taskSchema);