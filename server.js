import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

/* ROUTES */
import staffRoutes from "./src/routes/staffRoutes.js";
import authRoutes from "./src/routes/authRoutes.js";
import roleRoutes from "./src/routes/roleRoutes.js";
import permissionRoutes from "./src/routes/permissions.js";
import taskRoutes from "./src/routes/taskRoutes.js";
import taskStatusRoutes from "./src/routes/taskStatusRoutes.js";

/* SCRIPTS */
import createAdmin from "./src/scripts/createAdmin.js";
import { createRolesIfNotExist } from "./src/utils/createRoles.js";

dotenv.config();
const app = express();

/* ES MODULE PATH FIX */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ================= MIDDLEWARE ================= */

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* ================= STATIC UPLOADS ================= */

// Images
app.use(
  "/uploads/images",
  express.static(path.join(__dirname, "uploads/images"))
);

// Videos
app.use(
  "/uploads/videos",
  express.static(path.join(__dirname, "uploads/videos"))
);

/* ================= API ROUTES ================= */

app.use("/api/auth", authRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/role", roleRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/task-status", taskStatusRoutes);

/* ================= DATABASE ================= */

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

/* ================= INIT ================= */

createAdmin();
createRolesIfNotExist();

/* ================= START ================= */

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
