import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import cookieParser from "cookie-parser";

/* ROUTES */
import staffRoutes from "./src/routes/staffRoutes.js";
import authRoutes from "./src/routes/authRoutes.js";
import roleRoutes from "./src/routes/roleRoutes.js";
import permissionRoutes from "./src/routes/permissions.js";
import taskRoutes from "./src/routes/taskRoutes.js";
import taskStatusRoutes from "./src/routes/taskStatusRoutes.js"; // ✅ IMPORTED TASK STATUS ROUTES

/* SCRIPTS / UTILS */
import createAdmin from "./src/scripts/createAdmin.js";
import { createRolesIfNotExist } from "./src/utils/createRoles.js";

dotenv.config();

const app = express();

/* MIDDLEWARES */
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

/* API ROUTES */
app.use("/api/auth", authRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/role", roleRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/task-status", taskStatusRoutes); // ✅ WORKS NOW

/* DATABASE */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error(err));

/* INITIALIZATION SCRIPTS */
createAdmin();
createRolesIfNotExist();

/* START SERVER */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
