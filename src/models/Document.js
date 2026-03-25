import mongoose from "mongoose";

// ── Access Request sub-schema (unchanged) ─────────────────────────────────────
const accessRequestSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
  message:   { type: String, default: "" },
  status:    { type: String, enum: ["pending", "approved", "denied"], default: "pending" },
  createdAt: { type: Date, default: Date.now },
});

// ── Document Model ─────────────────────────────────────────────────────────────
const documentSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    content:     { type: String, default: "" },   // legacy single-page content (keep for backward compat)
    status: {
      type:    String,
      enum:    ["draft", "active", "review", "archived"],
      default: "draft",
    },

    // ── NEW: document type ──────────────────────────────────────────────────
    // "docx" → rich CKEditor pages, can export to PDF
    // "txt"  → plain-text pages, no formatting
    documentType: {
      type:    String,
      enum:    ["docx", "txt"],
      default: "docx",
    },

    // ── NEW: company scoping ────────────────────────────────────────────────
    // Every document belongs to a company. Only staff of that company
    // (or superadmin) can see it.
    company: {
      type:  mongoose.Schema.Types.ObjectId,
      ref:   "Company",
      default: null,
      index: true,
    },

    // ── NEW: default header & footer for all pages in this document ─────────
    defaultHeader: {
      type:    String,
      default: "",   // e.g. "Acme Corp | Confidential"
    },
    defaultFooter: {
      type:    String,
      default: "",   // e.g. "Page {page} of {total} | Acme Corp"
    },

    // ── Existing fields (unchanged) ──────────────────────────────────────────
    project:   { type: mongoose.Schema.Types.ObjectId, ref: "Project", default: null },
    assignee:  { type: mongoose.Schema.Types.ObjectId, ref: "Staff",   default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Staff",   default: null },
    file: {
      url:          { type: String },
      originalName: { type: String },
      mimetype:     { type: String },
      size:         { type: Number },
    },
    allowedUsers:   [{ type: mongoose.Schema.Types.ObjectId, ref: "Staff" }],
    accessRequests: [accessRequestSchema],
  },
  { timestamps: true }
);

export default mongoose.model("Document", documentSchema);