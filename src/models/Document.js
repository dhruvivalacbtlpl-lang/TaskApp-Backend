import mongoose from "mongoose";

const accessRequestSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
  message:   { type: String, default: "" },
  status:    { type: String, enum: ["pending", "approved", "denied"], default: "pending" },
  createdAt: { type: Date, default: Date.now },
});

const documentSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["draft", "active", "review", "archived"],
      default: "draft",
    },
    project:   { type: mongoose.Schema.Types.ObjectId, ref: "Project", default: null },
    assignee:  { type: mongoose.Schema.Types.ObjectId, ref: "Staff",   default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Staff",   default: null },
    file: {
      url:          { type: String },
      originalName: { type: String },
      mimetype:     { type: String },
      size:         { type: Number },
    },
    // ✅ users granted access via access request approval
    allowedUsers:   [{ type: mongoose.Schema.Types.ObjectId, ref: "Staff" }],
    accessRequests: [accessRequestSchema],
  },
  { timestamps: true }
);

export default mongoose.model("Document", documentSchema);