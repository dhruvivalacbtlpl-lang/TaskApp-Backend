import mongoose from "mongoose";

// One document per company per billing period
// Resets when plan is renewed
const usageLogSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
    },

    // Billing period this usage belongs to
    periodStart: { type: Date, required: true },
    periodEnd:   { type: Date, required: true },

    // Current usage counts (incremented on every create)
    usage: {
      staff:        { type: Number, default: 0 },
      projects:     { type: Number, default: 0 },
      teamMembers:  { type: Number, default: 0 },
      tasks:        { type: Number, default: 0 },
      issues:       { type: Number, default: 0 },
      documents:    { type: Number, default: 0 },
      taskStatuses: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

// Compound index: one usage log per company per period
usageLogSchema.index({ company: 1, periodStart: 1 }, { unique: true });

export default mongoose.models.UsageLog || mongoose.model("UsageLog", usageLogSchema);