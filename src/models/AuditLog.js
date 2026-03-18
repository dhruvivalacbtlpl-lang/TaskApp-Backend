import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    // Who did it
    user: {
      _id:  { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
      name: { type: String },
      role: { type: String }, // "Owner", "Admin", "SuperAdmin", etc.
    },

    // Which company (null for superadmin global actions)
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
    },

    // What happened
    action: {
      type: String,
      required: true,
      enum: [
        "CREATE", "UPDATE", "DELETE",
        "LOGIN", "LOGOUT",
        "ASSIGN",   // subscription assigned
        "PURCHASE", // subscription purchased
        "EXPIRE",   // subscription expired
        "BULK",     // bulk upload
      ],
    },

    // Which part of the system
    module: {
      type: String,
      required: true,
      enum: [
        "Task", "Issue", "Staff", "Project",
        "Document", "Subscription", "Role",
        "Permission", "Auth", "TaskStatus", "Team",
      ],
    },

    // Human-readable description
    description: { type: String, required: true },

    // Optional: what changed (before/after snapshot)
    metadata: {
      entityId:   { type: String, default: null }, // ID of affected record
      entityName: { type: String, default: null }, // name of affected record
      before:     { type: mongoose.Schema.Types.Mixed, default: null },
      after:      { type: mongoose.Schema.Types.Mixed, default: null },
    },

    // Request info
    ip:        { type: String, default: null },
    userAgent: { type: String, default: null },

    // createdAt is used by TTL index
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false } // we set createdAt manually for TTL
);

// ── TTL index: auto-delete logs older than 30 days ────────────────────────────
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// ── Indexes for fast querying ─────────────────────────────────────────────────
auditLogSchema.index({ company: 1, createdAt: -1 });
auditLogSchema.index({ "user._id": 1, createdAt: -1 });
auditLogSchema.index({ action: 1, module: 1 });

export default mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);