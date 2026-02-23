import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    status: { type: Number, default: 1 }, // 1=Active, 0=Inactive
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "Staff" }],
  },
  { timestamps: true }
);

export default mongoose.model("Project", projectSchema);