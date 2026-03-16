import mongoose from "mongoose";

const staffSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    mobile: { type: String },
    password: { type: String, required: true },
    role: { type: mongoose.Schema.Types.ObjectId, ref: "Role" },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: function () {
        // company is NOT required for superadmin
        return !this.isSuperAdmin;
      },
    },
    isOwner: { type: Boolean, default: false },
    isSuperAdmin: { type: Boolean, default: false }, // ← NEW
  },
  { timestamps: true }
);

// Email unique only within same company (superadmin has no company so no conflict)
staffSchema.index({ email: 1, company: 1 }, { unique: true, sparse: true });

export default mongoose.models.Staff || mongoose.model("Staff", staffSchema);