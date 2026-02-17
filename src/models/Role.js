  import mongoose from "mongoose";

  const roleSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    permissions: [
      {
        type : String
      },
    ],
    status: { type: Number, default: 1 }, // 0=deleted, 1=active, 2=inactive
  }, { timestamps: true });

  export default mongoose.model("Role", roleSchema);
