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

staffSchema.index({ email: 1, company: 1 }, { unique: true });

export default mongoose.model("Staff", staffSchema);