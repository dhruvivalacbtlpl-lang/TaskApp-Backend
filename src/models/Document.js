// models/Document.js
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
      type:    String,
      enum:    ["draft", "active", "review", "archived"],
      default: "draft",
    },
    project:  { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true }, // ← NOW REQUIRED
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: "Staff",   default: null },
    createdBy:{ type: mongoose.Schema.Types.ObjectId, ref: "Staff",   default: null },

    // ── FILE ATTACHMENT ──────────────────────────────────────────────────────
    file: {
      originalName: { type: String, default: null },
      storedName:   { type: String, default: null },
      mimetype:     { type: String, default: null },
      size:         { type: Number, default: null },
      url:          { type: String, default: null },
    },

    accessRequests: [accessRequestSchema],
  },
  { timestamps: true }
);

export default mongoose.model("Document", documentSchema);