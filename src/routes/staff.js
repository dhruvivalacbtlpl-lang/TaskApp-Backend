import mongoose from "mongoose";

const staffSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true }, // Global unique: true REMOVED
    mobile: { type: String },
    password: { type: String, required: true },
    role: { type: mongoose.Schema.Types.ObjectId, ref: "Role" },
    company: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Company", 
      required: true 
    },
    isOwner: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// IMPORTANT: This allows user@gmail.com to exist in Company A and Company B, 
// but prevents duplicate emails within the SAME company.
staffSchema.index({ email: 1, company: 1 }, { unique: true });

export default mongoose.model("Staff", staffSchema);