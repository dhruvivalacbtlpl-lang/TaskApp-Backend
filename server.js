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

/* ─── ALLOWED ORIGINS ───────────────────────────────────────────────────────── */
const allowedOrigins = [
  "http://localhost:5173",
  "https://w2ml73xv-5173.inc1.devtunnels.ms",
];

/* ─── CORS ───────────────────────────────────────────────────────────────────── */
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
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
  exposedHeaders: ["Content-Range", "X-Content-Range"],
  maxAge: 86400,
};

/* ─── SOCKET.IO ──────────────────────────────────────────────────────────────── */
export const io = new Server(httpServer, { cors: corsOptions });

/*
 * In-memory store of who is currently in each document room.
 * Structure: { [docId]: { [socketId]: { userId, name, avatar, mode } } }
 * mode = "viewing" | "editing"
 */
const docRooms = {};

io.on("connection", (socket) => {
  console.log("⚡ Client connected:", socket.id);

  /* ── User opens a document (viewer or editor) ──────────────────────────────
   * Payload: { docId, userId, name, avatar, mode: "viewing" | "editing" }
   */
  socket.on("document:join", ({ docId, userId, name, avatar, mode }) => {
    if (!docId) return;

    // Leave any previous doc room this socket was in
    leaveAllDocRooms(socket);

    // Join the new room
    socket.join(`doc:${docId}`);

    // Store user info
    if (!docRooms[docId]) docRooms[docId] = {};
    docRooms[docId][socket.id] = { userId, name, avatar: avatar || "", mode };

    // Tell everyone else in the room (not the joiner) who is present
    socket.to(`doc:${docId}`).emit("document:presence", {
      docId,
      users: getRoomUsers(docId),
    });

    // Also tell the joiner who is already here
    socket.emit("document:presence", {
      docId,
      users: getRoomUsers(docId),
    });

    console.log(`👁 ${name} joined doc:${docId} as [${mode}]`);
  });

  /* ── User switches from viewing → editing ───────────────────────────────── */
  socket.on("document:start_editing", ({ docId, userId, name }) => {
    if (!docId || !docRooms[docId]?.[socket.id]) return;

    docRooms[docId][socket.id].mode = "editing";

    // Broadcast to everyone in the room (including sender) that this person is editing
    io.to(`doc:${docId}`).emit("document:editing_started", {
      docId,
      userId,
      name,
      users: getRoomUsers(docId),
    });

    console.log(`✏️  ${name} started editing doc:${docId}`);
  });

  /* ── User stops editing (saves or cancels) ──────────────────────────────── */
  socket.on("document:stop_editing", ({ docId, userId, name }) => {
    if (!docId || !docRooms[docId]?.[socket.id]) return;

    docRooms[docId][socket.id].mode = "viewing";

    io.to(`doc:${docId}`).emit("document:editing_stopped", {
      docId,
      userId,
      name,
      users: getRoomUsers(docId),
    });

    console.log(`💾 ${name} stopped editing doc:${docId}`);
  });

  /* ── Document was saved — notify viewers to reload ─────────────────────── */
  socket.on("document:saved", ({ docId, userId, name }) => {
    if (!docId) return;

    // Broadcast to everyone EXCEPT the saver
    socket.to(`doc:${docId}`).emit("document:updated_by_other", {
      docId,
      savedBy: name,
    });

    console.log(`💾 ${name} saved doc:${docId} — notified others`);
  });

  /* ── User leaves the document ───────────────────────────────────────────── */
  socket.on("document:leave", ({ docId }) => {
    leaveDocRoom(socket, docId);
  });

  /* ── Disconnect — clean up all rooms ────────────────────────────────────── */
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

  // Tell remaining users
  socket.to(`doc:${docId}`).emit("document:presence", {
    docId,
    users: getRoomUsers(docId),
  });

  console.log(`👋 ${user?.name} left doc:${docId}`);
}

function leaveAllDocRooms(socket) {
  for (const docId of Object.keys(docRooms)) {
    if (docRooms[docId]?.[socket.id]) {
      leaveDocRoom(socket, docId);
    }
  }
}

/* ─── ES MODULE PATH FIX ─────────────────────────────────────────────────────── */
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/* ─── MIDDLEWARE ─────────────────────────────────────────────────────────────── */
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));   // handle ALL preflight requests
app.use(cookieParser());

// NOTE: multer handles multipart/form-data for bulk routes — express.json is for everything else
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

/* ─── STATIC FILES ───────────────────────────────────────────────────────────── */
app.use("/uploads/images",    express.static(path.join(__dirname, "uploads/images")));
app.use("/uploads/videos",    express.static(path.join(__dirname, "uploads/videos")));
app.use("/uploads/documents", express.static(path.join(__dirname, "uploads/documents")));

/* ─── ROUTES ─────────────────────────────────────────────────────────────────── */
app.use("/api/auth",        authRoutes);
app.use("/api/staff",       staffRoutes);
app.use("/api/role",        roleRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/tasks",       taskRoutes);       // tasks + issues (same collection, category field)
app.use("/api/task-status", taskStatusRoutes);
app.use("/api/projects",    projectRoutes);
app.use("/api/documents",   documentRoutes);

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

/* ─── START ──────────────────────────────────────────────────────────────────── */
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// Increased timeout for bulk uploads (10 lakh rows ~10-15s on Atlas)
httpServer.timeout          = 180000; // 3 minutes
httpServer.keepAliveTimeout = 180000; 