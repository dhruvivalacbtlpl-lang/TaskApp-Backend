import mongoose from "mongoose";

const planSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, enum: ["free", "basic", "pro"], unique: true },
    displayName: { type: String, required: true }, // "Free", "Basic", "Pro"
    description: { type: String, default: "" },
    color:       { type: String, default: "#6366f1" }, // for UI badge

    // Pricing in USD per billing cycle
    pricing: {
      monthly:    { type: Number, default: 0 },
      quarterly:  { type: Number, default: 0 }, // 3 months
      halfYearly: { type: Number, default: 0 }, // 6 months
      yearly:     { type: Number, default: 0 },
    },

    // Feature limits (-1 = unlimited)
    limits: {
      staff:        { type: Number, default: 3   },
      projects:     { type: Number, default: 2   },
      teamMembers:  { type: Number, default: 1   },
      tasks:        { type: Number, default: 20  },
      issues:       { type: Number, default: 20  },
      documents:    { type: Number, default: 5   },
      taskStatuses: { type: Number, default: 3   },
      bulkUpload:   { type: Number, default: 0   }, // 0 = disabled, -1 = unlimited, N = max rows
      devices:      { type: Number, default: 1   }, // concurrent device sessions
    },

    // Feature flags
    features: {
      notifications: { type: Boolean, default: false },
      bulkUpload:    { type: Boolean, default: false },
      prioritySupport: { type: Boolean, default: false },
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.Plan || mongoose.model("Plan", planSchema);