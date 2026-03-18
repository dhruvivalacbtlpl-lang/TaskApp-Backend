import mongoose from "mongoose";

// Tracks one active device session per login
const deviceSessionSchema = new mongoose.Schema({
  deviceId:  { type: String, required: true },  // hash of userId+userAgent+IP
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
  userAgent: { type: String },
  ip:        { type: String },
  loginAt:   { type: Date, default: Date.now },
  lastSeen:  { type: Date, default: Date.now },
}, { _id: false });

const subscriptionSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      unique: true, // one subscription per company
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      required: true,
    },

    // Billing cycle
    billingCycle: {
      type: String,
      enum: ["monthly", "quarterly", "halfYearly", "yearly"],
      default: "monthly",
    },

    status: {
      type: String,
      enum: ["active", "expired", "cancelled"],
      default: "active",
    },

    // Dates
    startDate:  { type: Date, default: Date.now },
    endDate:    { type: Date, required: true },    // expiry date
    renewedAt:  { type: Date, default: null },     // last renewal date

    // Payment (fake for now, real later)
    amount:      { type: Number, default: 0 },
    currency:    { type: String, default: "USD" },
    paymentNote: { type: String, default: "Manual assignment" },

    // Assigned by (superadmin who assigned or "self" for self-purchase)
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      default: null,
    },

    // Active device sessions
    activeSessions: [deviceSessionSchema],
  },
  { timestamps: true }
);

// Virtual: is subscription currently active?
subscriptionSchema.virtual("isActive").get(function () {
  return this.status === "active" && new Date() < new Date(this.endDate);
});

// Auto-expire: update status if endDate has passed
subscriptionSchema.pre("save", function (next) {
  if (this.endDate && new Date() > new Date(this.endDate)) {
    this.status = "expired";
  }
  next();
});

export default mongoose.models.Subscription || mongoose.model("Subscription", subscriptionSchema);