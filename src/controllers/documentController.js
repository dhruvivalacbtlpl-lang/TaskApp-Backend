// controllers/documentController.js
import Document from "../models/Document.js";
import Staff from "../models/Staff.js";
import {
  sendDocumentMail,
  sendAccessRequestMail,
  sendAccessResponseMail,
} from "../services/mail.js";

// ✅ Lazy-load io to avoid circular import crash (same pattern as taskController)
const getIO = async () => {
  const mod = await import("../../server.js");
  return mod.io;
};

const populate = [
  { path: "project",  select: "name" },
  { path: "assignee", select: "name email" },
  { path: "createdBy", select: "name email" },
  { path: "accessRequests.user", select: "name email role" },
];

// ─── GET ALL DOCUMENTS ────────────────────────────────────────────────────────
export const getDocuments = async (req, res) => {
  try {
    const docs = await Document.find()
      .populate(populate)
      .sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) {
    console.error("❌ getDocuments:", err.message);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
};

// ─── GET SINGLE DOCUMENT ──────────────────────────────────────────────────────
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

// ─── GET PENDING ACCESS REQUESTS (admin) ──────────────────────────────────────
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
            _id: r._id,
            user: r.user,
            message: r.message,
            createdAt: r.createdAt,
            document: { _id: doc._id, title: doc.title, project: doc.project },
          });
        });
    });

    res.json(requests);
  } catch (err) {
    console.error("❌ getAccessRequests:", err.message);
    res.status(500).json({ error: "Failed to fetch access requests" });
  }
};

// ─── CREATE DOCUMENT ─────────────────────────────────────────────────────────
export const createDocument = async (req, res) => {
  try {
    const { title, description, status, project, assignee } = req.body;

    if (!title || !description || !assignee) {
      return res.status(400).json({ error: "title, description, and assignee are required" });
    }

    const doc = await Document.create({
      title,
      description,
      status: status || "draft",
      project: project || null,
      assignee,
      createdBy: req.user?._id || null,
    });

    const populated = await Document.findById(doc._id).populate(populate);

    // Socket
    try {
      const io = await getIO();
      io.emit("document:created", populated);
    } catch (ioErr) {
      console.error("⚠️ Socket emit failed (non-fatal):", ioErr.message);
    }

    // Email assignee
    try {
      if (populated.assignee?.email) {
        await sendDocumentMail({
          email: populated.assignee.email,
          assigneeName: populated.assignee.name,
          documentTitle: populated.title,
          description: populated.description || "—",
          status: populated.status,
          project: populated.project?.name || null,
          assignedBy: req.user?.name || "Admin",
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

// ─── UPDATE DOCUMENT ─────────────────────────────────────────────────────────
export const updateDocument = async (req, res) => {
  try {
    const updateData = { ...req.body };

    if (updateData.project  === "") updateData.project  = null;
    if (updateData.assignee === "") updateData.assignee = null;

    const doc = await Document.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: false }
    ).populate(populate);

    if (!doc) return res.status(404).json({ error: "Document not found" });

    // Socket
    try {
      const io = await getIO();
      io.emit("document:updated", doc);
    } catch (ioErr) {
      console.error("⚠️ Socket emit failed (non-fatal):", ioErr.message);
    }

    // Email assignee on update
    try {
      if (doc.assignee?.email) {
        await sendDocumentMail({
          email: doc.assignee.email,
          assigneeName: doc.assignee.name,
          documentTitle: doc.title,
          description: doc.description || "—",
          status: doc.status,
          project: doc.project?.name || null,
          assignedBy: req.user?.name || "Admin",
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

// ─── DELETE DOCUMENT ─────────────────────────────────────────────────────────
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
    const { message } = req.body;
    const doc = await Document.findById(req.params.id).populate("project", "name");
    if (!doc) return res.status(404).json({ error: "Document not found" });

    // Prevent duplicate pending requests from same user
    const already = doc.accessRequests.find(
      (r) => r.user.toString() === req.user._id.toString() && r.status === "pending"
    );
    if (already) {
      return res.status(400).json({ error: "You already have a pending access request for this document" });
    }

    doc.accessRequests.push({
      user: req.user._id,
      message: message || "",
      status: "pending",
    });
    await doc.save();

    // Email all admins
    try {
      const admins = await Staff.find({}).populate("role", "name");
      const adminList = admins.filter(
        (s) => s.role?.name?.toLowerCase() === "admin" && s.email
      );

      for (const admin of adminList) {
        await sendAccessRequestMail({
          adminEmail: admin.email,
          adminName: admin.name,
          requesterName: req.user.name,
          requesterEmail: req.user.email,
          documentTitle: doc.title,
          project: doc.project?.name || null,
          message: message || "",
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
    const { status } = req.body; // "approved" | "denied"
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
    await doc.save();

    // Email the requester
    try {
      if (request.user?.email) {
        await sendAccessResponseMail({
          email: request.user.email,
          requesterName: request.user.name,
          documentTitle: doc.title,
          project: doc.project?.name || null,
          approved: status === "approved",
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