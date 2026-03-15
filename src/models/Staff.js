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
      required: true,
    },
    isOwner: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// This ensures email is unique ONLY within the same company
staffSchema.index({ email: 1, company: 1 }, { unique: true });

export default mongoose.models.Staff || mongoose.model("Staff", staffSchema);