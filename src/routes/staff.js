import mongoose from "mongoose";

const staffSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  mobile: { type: String, required: true },
  role: { type: mongoose.Schema.Types.ObjectId, ref: "Role" }, // link role
  status: { type: Number, default: 1 }, // 0=deleted, 1=active, 2=inactive
}, { timestamps: true });

export default mongoose.model("Staff", staffSchema);