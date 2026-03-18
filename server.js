import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";

import staffRoutes        from "./src/routes/staffRoutes.js";
import authRoutes         from "./src/routes/authRoutes.js";
import roleRoutes         from "./src/routes/roleRoutes.js";
import permissionRoutes   from "./src/routes/permissions.js";
import taskRoutes         from "./src/routes/taskRoutes.js";
import taskStatusRoutes   from "./src/routes/taskStatusRoutes.js";
import projectRoutes      from "./src/routes/projectRoutes.js";
import documentRoutes     from "./src/routes/documentRoutes.js";
import companyRoutes      from "./src/routes/companyRoutes.js";
import subscriptionRoutes from "./src/routes/subscriptionRoutes.js"; // ← NEW
import auditRoutes        from "./src/routes/auditRoutes.js";        // ← NEW

// Register models so Mongoose knows about them
import "./src/models/Company.js";
import "./src/models/Plan.js";         // ← NEW
import "./src/models/Subscription.js"; // ← NEW
import "./src/models/UsageLog.js";     // ← NEW
import "./src/models/AuditLog.js";     // ← NEW

import createAdmin               from "./src/scripts/createAdmin.js";
import { createRolesIfNotExist } from "./src/utils/createRoles.js";
import { seedPlans }             from "./src/scripts/seedPlans.js"; // ← NEW

dotenv.config();

const app        = express();
const httpServer = createServer(app);

/* ─── TRUST PROXY ────────────────────────────────────────────────────────────── */
app.set("trust proxy", 1);

/* ─── ALLOWED ORIGINS ───────────────────────────────────────────────────────── */
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  process.env.FRONTEND_URL,
].filter(Boolean);

/* ─── CORS ───────────────────────────────────────────────────────────────────── */
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`🚫 CORS blocked: ${origin}`);
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin", "Cache-Control"],
  exposedHeaders: ["Content-Range", "X-Content-Range"],
  maxAge: 86400,
};

/* ─── MIDDLEWARE ─────────────────────────────────────────────────────────────── */
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

/* ─── CACHE HEADERS ──────────────────────────────────────────────────────────── */
app.use((req, res, next) => {
  if (req.method === "GET") {
    res.set("Cache-Control", "private, max-age=30");
  }
  next();
});

/* ─── SOCKET.IO ──────────────────────────────────────────────────────────────── */
export const io = new Server(httpServer, { cors: corsOptions });

const docRooms = {};

io.on("connection", (socket) => {
  console.log("⚡ Client connected:", socket.id);

  socket.on("document:join", ({ docId, userId, name, avatar, mode }) => {
    if (!docId) return;
    leaveAllDocRooms(socket);
    socket.join(`doc:${docId}`);
    if (!docRooms[docId]) docRooms[docId] = {};
    docRooms[docId][socket.id] = { userId, name, avatar: avatar || "", mode };
    socket.to(`doc:${docId}`).emit("document:presence", { docId, users: getRoomUsers(docId) });
    socket.emit("document:presence", { docId, users: getRoomUsers(docId) });
    console.log(`👁 ${name} joined doc:${docId} as [${mode}]`);
  });

  socket.on("document:start_editing", ({ docId, userId, name }) => {
    if (!docId || !docRooms[docId]?.[socket.id]) return;
    docRooms[docId][socket.id].mode = "editing";
    io.to(`doc:${docId}`).emit("document:editing_started", { docId, userId, name, users: getRoomUsers(docId) });
    console.log(`✏️  ${name} started editing doc:${docId}`);
  });

  socket.on("document:stop_editing", ({ docId, userId, name }) => {
    if (!docId || !docRooms[docId]?.[socket.id]) return;
    docRooms[docId][socket.id].mode = "viewing";
    io.to(`doc:${docId}`).emit("document:editing_stopped", { docId, userId, name, users: getRoomUsers(docId) });
    console.log(`💾 ${name} stopped editing doc:${docId}`);
  });

  socket.on("document:saved", ({ docId, userId, name }) => {
    if (!docId) return;
    socket.to(`doc:${docId}`).emit("document:updated_by_other", { docId, savedBy: name });
    console.log(`💾 ${name} saved doc:${docId} — notified others`);
  });

  socket.on("document:leave", ({ docId }) => { leaveDocRoom(socket, docId); });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
    leaveAllDocRooms(socket);
  });
});

/* ─── HELPERS ────────────────────────────────────────────────────────────────── */
function getRoomUsers(docId) {
  if (!docRooms[docId]) return [];
  return Object.entries(docRooms[docId]).map(([sid, info]) => ({ socketId: sid, ...info }));
}

function leaveDocRoom(socket, docId) {
  if (!docId || !docRooms[docId]?.[socket.id]) return;
  const user = docRooms[docId][socket.id];
  delete docRooms[docId][socket.id];
  if (Object.keys(docRooms[docId]).length === 0) delete docRooms[docId];
  socket.leave(`doc:${docId}`);
  socket.to(`doc:${docId}`).emit("document:presence", { docId, users: getRoomUsers(docId) });
  console.log(`👋 ${user?.name} left doc:${docId}`);
}

function leaveAllDocRooms(socket) {
  for (const docId of Object.keys(docRooms)) {
    if (docRooms[docId]?.[socket.id]) leaveDocRoom(socket, docId);
  }
}

/* ─── ES MODULE PATH FIX ─────────────────────────────────────────────────────── */
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/* ─── STATIC FILES ───────────────────────────────────────────────────────────── */
app.use("/uploads/images",    express.static(path.join(__dirname, "uploads/images")));
app.use("/uploads/videos",    express.static(path.join(__dirname, "uploads/videos")));
app.use("/uploads/documents", express.static(path.join(__dirname, "uploads/documents")));

/* ─── ONE-TIME MIGRATION ─────────────────────────────────────────────────────── */
app.get("/api/fix-staff", async (req, res) => {
  try {
    const Staff   = (await import("./src/models/Staff.js")).default;
    const Company = (await import("./src/models/Company.js")).default;
    const company = await Company.findOne();
    if (!company) return res.json({ error: "No company found in database" });
    const result = await Staff.updateMany(
      { company: { $in: [null, undefined] } },
      { $set: { company: company._id } }
    );
    res.json({ success: true, fixed: result.modifiedCount, company: company.name });
  } catch(err) {
    res.json({ error: err.message });
  }
});

/* ─── ROUTES ─────────────────────────────────────────────────────────────────── */
app.use("/api/auth",         authRoutes);
app.use("/api/staff",        staffRoutes);
app.use("/api/role",         roleRoutes);
app.use("/api/permissions",  permissionRoutes);
app.use("/api/tasks",        taskRoutes);
app.use("/api/task-status",  taskStatusRoutes);
app.use("/api/projects",     projectRoutes);
app.use("/api/documents",    documentRoutes);
app.use("/api/company",      companyRoutes);
app.use("/api/subscription", subscriptionRoutes); // ← NEW
app.use("/api/audit",        auditRoutes);        // ← NEW

/* ─── GLOBAL ERROR HANDLER ───────────────────────────────────────────────────── */
app.use((err, req, res, next) => {
  console.error("❌ Error:", err.message);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

/* ─── DATABASE ───────────────────────────────────────────────────────────────── */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

/* ─── INIT ───────────────────────────────────────────────────────────────────── */
createAdmin();
createRolesIfNotExist();
seedPlans(); // ← NEW — seeds Free, Basic, Pro plans (safe, uses upsert)

/* ─── START ──────────────────────────────────────────────────────────────────── */
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

httpServer.timeout          = 180000;
httpServer.keepAliveTimeout = 180000;