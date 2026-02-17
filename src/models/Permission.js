import mongoose from "mongoose";

const permissionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  value: { type: String, required: true },
  status: { type: Number, default: 1 }
}, { timestamps: true });

export default mongoose.models.Permission || 
       mongoose.model("Permission", permissionSchema);
