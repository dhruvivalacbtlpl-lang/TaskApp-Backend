import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";

import staffRoutes      from "./src/routes/staffRoutes.js";
import authRoutes       from "./src/routes/authRoutes.js";
import roleRoutes       from "./src/routes/roleRoutes.js";
import permissionRoutes from "./src/routes/permissions.js";
import taskRoutes       from "./src/routes/taskRoutes.js";
import taskStatusRoutes from "./src/routes/taskStatusRoutes.js";
import projectRoutes    from "./src/routes/projectRoutes.js";
import documentRoutes   from "./src/routes/documentRoutes.js";

import createAdmin               from "./src/scripts/createAdmin.js";
import { createRolesIfNotExist } from "./src/utils/createRoles.js";

dotenv.config();

const app        = express();
const httpServer = createServer(app);

/* ================= ALLOWED ORIGINS ================= */
const allowedOrigins = [
  "http://localhost:5173",
  "https://w2ml73xv-5173.inc1.devtunnels.ms",
];

/* ================= CORS CONFIG ================= */
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
  ],
  exposedHeaders: ["Content-Range", "X-Content-Range"],
  maxAge: 86400, // cache preflight for 24h — browser won't re-send OPTIONS
};

/* ================= SOCKET.IO ================= */
const io = new Server(httpServer, { cors: corsOptions });

io.on("connection", (socket) => {
  console.log("⚡ Client connected:", socket.id);
  socket.on("disconnect", () => console.log("❌ Disconnected:", socket.id));
});

export { io };

/* ================= ES MODULE PATH FIX ================= */
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/* ================= MIDDLEWARE ================= */
app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // ✅ handle ALL preflight requests immediately
app.use(cookieParser());
app.use(express.json({ limit: "100mb" }));                       // ✅ increased for bulk uploads
app.use(express.urlencoded({ limit: "100mb", extended: true })); // ✅ increased for bulk uploads

// ✅ Explicit preflight handler for bulk routes (large payload CORS fix)
app.options("/api/tasks/issues/bulk", cors(corsOptions));
app.options("/api/tasks/bulk",        cors(corsOptions));

/* ================= STATIC FILES ================= */
app.use("/uploads/images",    express.static(path.join(__dirname, "uploads/images")));
app.use("/uploads/videos",    express.static(path.join(__dirname, "uploads/videos")));
app.use("/uploads/documents", express.static(path.join(__dirname, "uploads/documents")));

/* ================= API ROUTES ================= */
app.use("/api/auth",        authRoutes);
app.use("/api/staff",       staffRoutes);
app.use("/api/role",        roleRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/tasks",       taskRoutes);
app.use("/api/task-status", taskStatusRoutes);
app.use("/api/projects",    projectRoutes);
app.use("/api/documents",   documentRoutes);

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
httpServer.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// ✅ Increase timeout for large bulk uploads (200k rows can take a few seconds)
httpServer.timeout         = 120000; // 2 minutes
httpServer.keepAliveTimeout = 120000;