import Document from "../models/Document.js";
import Staff    from "../models/Staff.js";
import jwt      from "jsonwebtoken";
import {
  sendDocumentMail,
  sendAccessRequestMail,
  sendAccessResponseMail,
} from "../services/mail.js";

const getIO = async () => {
  const mod = await import("../../server.js");
  return mod.io;
};

const populate = [
  { path: "project",             select: "name" },
  { path: "assignee",            select: "name email" },
  { path: "createdBy",           select: "name email" },
  { path: "allowedUsers",        select: "name email" },
  { path: "accessRequests.user", select: "name email role" },
];

// ── Helper: extract user from cookie token ────────────────────────────────────
const getUserFromToken = async (req) => {
  try {
    const token = req.cookies?.token;
    if (!token) return null;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const staff   = await Staff.findById(decoded.id).populate("role");
    return staff || null;
  } catch {
    return null;
  }
};

// ─── GET ALL ──────────────────────────────────────────────────────────────────
export const getDocuments = async (req, res) => {
  try {
    const docs = await Document.find().populate(populate).sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) {
    console.error("❌ getDocuments:", err.message);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
};

// ─── GET ONE ──────────────────────────────────────────────────────────────────
export const getDocumentById = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id).populate(populate);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    res.json(doc);
  } catch (err) {
    console.error("❌ getDocumentById:", err.message);
    res.status(500).json({ error: "Failed to fetch document" });
  }
};

// ─── GET PENDING ACCESS REQUESTS ─────────────────────────────────────────────
export const getAccessRequests = async (req, res) => {
  try {
    const docs = await Document.find({ "accessRequests.status": "pending" })
      .populate("accessRequests.user", "name email role")
      .populate("project", "name");

    const requests = [];
    docs.forEach((doc) => {
      doc.accessRequests
        .filter((r) => r.status === "pending")
        .forEach((r) => {
          requests.push({
            _id:       r._id,
            user:      r.user,
            message:   r.message,
            createdAt: r.createdAt,
            document:  { _id: doc._id, title: doc.title, project: doc.project },
          });
        });
    });

    res.json(requests);
  } catch (err) {
    console.error("❌ getAccessRequests:", err.message);
    res.status(500).json({ error: "Failed to fetch access requests" });
  }
};

// ─── CREATE ───────────────────────────────────────────────────────────────────
export const createDocument = async (req, res) => {
  try {
    const currentUser = await getUserFromToken(req);
    const { title, description, status, project, assignee } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: "title and description are required" });
    }

    const file = req.file ? {
      url:          `/uploads/documents/${req.file.filename}`,
      originalName: req.file.originalname,
      mimetype:     req.file.mimetype,
      size:         req.file.size,
    } : undefined;

    const doc = await Document.create({
      title,
      description,
      status:    status   || "draft",
      project:   project  || null,
      assignee:  assignee || null,
      createdBy: currentUser?._id || null,
      ...(file && { file }),
    });

    const populated = await Document.findById(doc._id).populate(populate);

    try {
      const io = await getIO();
      io.emit("document:created", populated);
    } catch (ioErr) {
      console.error("⚠️ Socket emit failed (non-fatal):", ioErr.message);
    }

    try {
      if (populated.assignee?.email) {
        await sendDocumentMail({
          email:         populated.assignee.email,
          assigneeName:  populated.assignee.name,
          documentTitle: populated.title,
          description:   populated.description || "—",
          status:        populated.status,
          project:       populated.project?.name || null,
          assignedBy:    currentUser?.name || "Admin",
        });
      }
    } catch (mailErr) {
      console.error("⚠️ Document mail failed (non-fatal):", mailErr.message);
    }

    res.status(201).json(populated);
  } catch (err) {
    console.error("❌ createDocument:", err.name, "-", err.message);
    res.status(500).json({ error: "Failed to create document", details: err.message });
  }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────
export const updateDocument = async (req, res) => {
  try {
    const currentUser = await getUserFromToken(req);
    const updateData  = { ...req.body };

    if (updateData.project  === "") updateData.project  = null;
    if (updateData.assignee === "") updateData.assignee = null;

    if (req.file) {
      updateData.file = {
        url:          `/uploads/documents/${req.file.filename}`,
        originalName: req.file.originalname,
        mimetype:     req.file.mimetype,
        size:         req.file.size,
      };
    }

    if (req.body.removeFile === "true") {
      updateData.file = null;
    }

    const doc = await Document.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: false }
    ).populate(populate);

    if (!doc) return res.status(404).json({ error: "Document not found" });

    try {
      const io = await getIO();
      io.emit("document:updated", doc);
    } catch (ioErr) {
      console.error("⚠️ Socket emit failed (non-fatal):", ioErr.message);
    }

    try {
      if (doc.assignee?.email) {
        await sendDocumentMail({
          email:         doc.assignee.email,
          assigneeName:  doc.assignee.name,
          documentTitle: doc.title,
          description:   doc.description || "—",
          status:        doc.status,
          project:       doc.project?.name || null,
          assignedBy:    currentUser?.name || "Admin",
        });
      }
    } catch (mailErr) {
      console.error("⚠️ Document update mail failed (non-fatal):", mailErr.message);
    }

    res.json(doc);
  } catch (err) {
    console.error("❌ updateDocument:", err.message);
    res.status(500).json({ error: "Failed to update document", details: err.message });
  }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
export const deleteDocument = async (req, res) => {
  try {
    await Document.findByIdAndDelete(req.params.id);

    try {
      const io = await getIO();
      io.emit("document:deleted", { _id: req.params.id });
    } catch (ioErr) {
      console.error("⚠️ Socket emit failed (non-fatal):", ioErr.message);
    }

    res.json({ message: "Deleted" });
  } catch (err) {
    console.error("❌ deleteDocument:", err.message);
    res.status(500).json({ error: "Failed to delete document" });
  }
};

// ─── REQUEST ACCESS ───────────────────────────────────────────────────────────
export const requestAccess = async (req, res) => {
  try {
    const currentUser = await getUserFromToken(req);
    if (!currentUser) return res.status(401).json({ error: "Not authenticated" });

    const { message } = req.body;
    const doc = await Document.findById(req.params.id).populate("project", "name");
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const already = doc.accessRequests.find(
      (r) => r.user.toString() === currentUser._id.toString() && r.status === "pending"
    );
    if (already) {
      return res.status(400).json({ error: "You already have a pending access request for this document" });
    }

    doc.accessRequests.push({ user: currentUser._id, message: message || "", status: "pending" });
    await doc.save();

    // ✅ Get the ID of the request we just created
    const newRequest = doc.accessRequests[doc.accessRequests.length - 1];

    try {
      const admins = await Staff.find({}).populate("role", "name");
      const adminList = admins.filter(
        (s) => s.role?.name?.toLowerCase() === "admin" && s.email
      );
      for (const admin of adminList) {
        await sendAccessRequestMail({
          adminEmail:     admin.email,
          adminName:      admin.name,
          requesterName:  currentUser.name,
          requesterEmail: currentUser.email,
          documentTitle:  doc.title,
          project:        doc.project?.name || null,
          message:        message || "",
          // ✅ Pass requestId so admin sees only this specific request in popup
          reviewLink: `${process.env.FRONTEND_URL}/go?p=documents&requestId=${newRequest._id}`,
        });
      }
    } catch (mailErr) {
      console.error("⚠️ Access request mail failed (non-fatal):", mailErr.message);
    }

    res.json({ message: "Access request submitted" });
  } catch (err) {
    console.error("❌ requestAccess:", err.message);
    res.status(500).json({ error: "Failed to submit access request" });
  }
};

// ─── APPROVE / DENY ACCESS REQUEST ───────────────────────────────────────────
export const respondToAccessRequest = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["approved", "denied"].includes(status)) {
      return res.status(400).json({ error: "status must be 'approved' or 'denied'" });
    }

    const doc = await Document.findOne({ "accessRequests._id": req.params.requestId })
      .populate("accessRequests.user", "name email")
      .populate("project", "name");

    if (!doc) return res.status(404).json({ error: "Request not found" });

    const request = doc.accessRequests.id(req.params.requestId);
    if (!request) return res.status(404).json({ error: "Request not found" });

    request.status = status;

    // ✅ If approved — add user to allowedUsers
    let accessToken = null;
    if (status === "approved") {
      const userId = request.user?._id || request.user;
      const alreadyAllowed = doc.allowedUsers.some(
        (u) => u.toString() === userId.toString()
      );
      if (!alreadyAllowed) {
        doc.allowedUsers.push(userId);
      }

      // ✅ Generate a signed token valid for 7 days for the email link
      accessToken = jwt.sign(
        {
          userId: userId.toString(),
          docId:  doc._id.toString(),
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );
    }

    await doc.save();

    // ✅ Emit socket so frontend updates in real time
    try {
      const updatedDoc = await Document.findById(doc._id).populate([
        { path: "project",      select: "name" },
        { path: "assignee",     select: "name email" },
        { path: "createdBy",    select: "name email" },
        { path: "allowedUsers", select: "name email" },
      ]);
      const io = await getIO();
      io.emit("document:updated", updatedDoc);
    } catch (ioErr) {
      console.error("⚠️ Socket emit failed (non-fatal):", ioErr.message);
    }

    // ✅ Send email with real View Document link when approved
    try {
      if (request.user?.email) {
        const viewLink = status === "approved" && accessToken
          ? `${process.env.FRONTEND_URL}/go?p=documents&token=${accessToken}&docId=${doc._id}`
          : null;

        await sendAccessResponseMail({
          email:         request.user.email,
          requesterName: request.user.name,
          documentTitle: doc.title,
          project:       doc.project?.name || null,
          approved:      status === "approved",
          viewLink,
        });
      }
    } catch (mailErr) {
      console.error("⚠️ Access response mail failed (non-fatal):", mailErr.message);
    }

    res.json({ message: `Access request ${status}` });
  } catch (err) {
    console.error("❌ respondToAccessRequest:", err.message);
    res.status(500).json({ error: "Failed to update access request" });
  }
};

// ─── VERIFY DOCUMENT TOKEN ────────────────────────────────────────────────────
// Called by frontend when user opens the email link
// GET /api/documents/verify-token?token=xxx&docId=yyy
export const verifyDocumentToken = async (req, res) => {
  try {
    const { token, docId } = req.query;
    if (!token)  return res.status(401).json({ error: "No token provided" });
    if (!docId)  return res.status(400).json({ error: "No docId provided" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Make sure token is for this specific document
    if (decoded.docId !== docId) {
      return res.status(403).json({ error: "Token is not valid for this document" });
    }

    res.json({ valid: true, userId: decoded.userId, docId: decoded.docId });
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};