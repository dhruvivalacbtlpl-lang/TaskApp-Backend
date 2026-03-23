import mongoose from "mongoose";

const planSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    displayName: { type: String, required: true },
    description: { type: String },
    color: { type: String, default: "blue" },
    
    // Numerical Limits
    limits: {
      staff: { type: Number, default: 3 },
      projects: { type: Number, default: 5 },
      tasks: { type: Number, default: -1 },
      issues: { type: Number, default: -1 },
      documents: { type: Number, default: -1 },
      taskStatuses: { type: Number, default: -1 },
    },

    // ✅ FIXED: Features as an Object of Booleans (Matching your Seed data)
    features: {
      notifications: { type: Boolean, default: false },
      bulkUpload: { type: Boolean, default: false },
      prioritySupport: { type: Boolean, default: false },
      aiTools: { type: Boolean, default: false },
      customBranding: { type: Boolean, default: false },
    },

    pricing: {
      monthly: { type: Number, default: 0 },
      quarterly: { type: Number, default: 0 },
      halfYearly: { type: Number, default: 0 },
      yearly: { type: Number, default: 0 },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.Plan || mongoose.model("Plan", planSchema);