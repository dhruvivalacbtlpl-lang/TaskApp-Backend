import Documentpage from "../models/Documentpage.js";
import Document     from "../models/Document.js";
import Staff        from "../models/Staff.js";
import jwt          from "jsonwebtoken";

// ── Helper: get current user from cookie token ────────────────────────────────
const getUserFromToken = async (req) => {
  try {
    const token = req.cookies?.token;
    if (!token) return null;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return await Staff.findById(decoded.id).populate("role company") || null;
  } catch {
    return null;
  }
};

// ── Helper: check if user can access a document ───────────────────────────────
const canAccessDocument = (doc, user) => {
  if (!user) return false;
  const roleName = user.role?.name?.toLowerCase();
  if (roleName === "superadmin") return true;
  if (!doc.company) return true;
  return doc.company?.toString() === user.company?._id?.toString()
      || doc.company?.toString() === user.company?.toString();
};

const isSuperAdmin = (user) =>
  user?.role?.name?.toLowerCase() === "superadmin";

// ── GET /api/document-pages?documentId=xxx ────────────────────────────────────
export const getDocumentpages = async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    const { documentId } = req.query;
    if (!documentId) return res.status(400).json({ error: "documentId is required" });

    const doc = await Document.findById(documentId).populate("company");
    if (!doc) return res.status(404).json({ error: "Document not found" });

    if (!canAccessDocument(doc, user)) {
      return res.status(403).json({ error: "Access denied — wrong company" });
    }

    const pages = await Documentpage.find({ document: documentId })
      .sort({ pageNumber: 1 })
      .populate("createdBy", "name email")
      .populate("updatedBy",  "name email");

    res.json(pages);
  } catch (err) {
    console.error("❌ getDocumentPages:", err.message);
    res.status(500).json({ error: "Failed to fetch pages" });
  }
};

// ── GET /api/document-pages/:id ───────────────────────────────────────────────
export const getDocumentpageById = async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    const page = await Documentpage.findById(req.params.id)
      .populate("document")
      .populate("createdBy", "name email")
      .populate("updatedBy",  "name email");

    if (!page) return res.status(404).json({ error: "Page not found" });

    const doc = await Document.findById(page.document).populate("company");
    if (!canAccessDocument(doc, user)) {
      return res.status(403).json({ error: "Access denied — wrong company" });
    }

    res.json(page);
  } catch (err) {
    console.error("❌ getDocumentPageById:", err.message);
    res.status(500).json({ error: "Failed to fetch page" });
  }
};

// ── POST /api/document-pages ──────────────────────────────────────────────────
export const createDocumentPage = async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    const { documentId, pageNumber, pageContent, headerText, footerText } = req.body;
    if (!documentId) return res.status(400).json({ error: "documentId is required" });

    const doc = await Document.findById(documentId).populate("company");
    if (!doc) return res.status(404).json({ error: "Document not found" });

    if (!canAccessDocument(doc, user)) {
      return res.status(403).json({ error: "Access denied — wrong company" });
    }

    const existingCount = await Documentpage.countDocuments({ document: documentId });
    if (existingCount >= 5) {
      return res.status(400).json({ error: "Maximum 5 pages allowed per document" });
    }

    let targetPage = pageNumber;
    if (!targetPage) {
      const lastPage = await Documentpage.findOne({ document: documentId }).sort({ pageNumber: -1 });
      targetPage = lastPage ? lastPage.pageNumber + 1 : 1;
    }

    const page = await Documentpage.create({
      document:    documentId,
      pageNumber:  targetPage,
      pageContent: pageContent || "",
      headerText:  headerText !== undefined ? headerText : doc.defaultHeader,
      footerText:  footerText !== undefined ? footerText : doc.defaultFooter,
      createdBy:   user._id,
      updatedBy:   user._id,
    });

    const populated = await Documentpage.findById(page._id)
      .populate("createdBy", "name email")
      .populate("updatedBy",  "name email");

    res.status(201).json(populated);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: "A page with that number already exists" });
    }
    console.error("❌ createDocumentPage:", err.message);
    res.status(500).json({ error: "Failed to create page" });
  }
};

// ── PUT /api/document-pages/:id ───────────────────────────────────────────────
export const updateDocumentPage = async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    const { pageContent, headerText, footerText } = req.body;

    const page = await Documentpage.findById(req.params.id).populate("document");
    if (!page) return res.status(404).json({ error: "Page not found" });

    const doc = await Document.findById(page.document).populate("company");
    if (!canAccessDocument(doc, user)) {
      return res.status(403).json({ error: "Access denied — wrong company" });
    }

    if (pageContent !== undefined) page.pageContent = pageContent;
    if (headerText  !== undefined) page.headerText  = headerText;
    if (footerText  !== undefined) page.footerText  = footerText;
    page.updatedBy = user._id;

    await page.save();

    const updated = await Documentpage.findById(page._id)
      .populate("createdBy", "name email")
      .populate("updatedBy",  "name email");

    res.json(updated);
  } catch (err) {
    console.error("❌ updateDocumentPage:", err.message);
    res.status(500).json({ error: "Failed to update page" });
  }
};

// ── PUT /api/document-pages/bulk-save ────────────────────────────────────────
export const bulkSavePages = async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    const { documentId, pages } = req.body;

    if (!documentId || !Array.isArray(pages)) {
      return res.status(400).json({ error: "documentId and pages[] are required" });
    }

    const doc = await Document.findById(documentId).populate("company");
    if (!doc) return res.status(404).json({ error: "Document not found" });

    if (!canAccessDocument(doc, user)) {
      return res.status(403).json({ error: "Access denied — wrong company" });
    }

    if (pages.length > 5) {
      return res.status(400).json({ error: "Maximum 5 pages allowed per document" });
    }

    const results = [];

    for (const p of pages) {
      const { pageNumber, pageContent, headerText, footerText } = p;

      const updated = await Documentpage.findOneAndUpdate(
        { document: documentId, pageNumber },
        {
          $set: {
            pageContent: pageContent ?? "",
            headerText:  headerText  ?? doc.defaultHeader ?? "",
            footerText:  footerText  ?? doc.defaultFooter ?? "",
            updatedBy:   user._id,
          },
          $setOnInsert: {
            document:  documentId,
            createdBy: user._id,
          },
        },
        { upsert: true, new: true, runValidators: true }
      )
        .populate("createdBy", "name email")
        .populate("updatedBy",  "name email");

      results.push(updated);
    }

    // Clean up removed pages
    const keptPageNumbers = pages.map((p) => p.pageNumber);
    await Documentpage.deleteMany({
      document:   documentId,
      pageNumber: { $nin: keptPageNumbers },
    });

    res.json({ message: "Pages saved", pages: results });
  } catch (err) {
    console.error("❌ bulkSavePages:", err.message, err.stack);
    res.status(500).json({ error: "Failed to bulk save pages", details: err.message });
  }
};

// ── DELETE /api/document-pages/:id ───────────────────────────────────────────
export const deleteDocumentPage = async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    const page = await Documentpage.findById(req.params.id).populate("document");
    if (!page) return res.status(404).json({ error: "Page not found" });

    const doc = await Document.findById(page.document).populate("company");
    if (!canAccessDocument(doc, user)) {
      return res.status(403).json({ error: "Access denied — wrong company" });
    }

    const total = await Documentpage.countDocuments({ document: page.document });
    if (total === 1) {
      return res.status(400).json({ error: "Cannot delete the only page" });
    }

    await Documentpage.findByIdAndDelete(req.params.id);

    // Re-number remaining pages
    const remaining = await Documentpage.find({ document: page.document }).sort({ pageNumber: 1 });
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].pageNumber !== i + 1) {
        remaining[i].pageNumber = i + 1;
        await remaining[i].save();
      }
    }

    res.json({ message: "Page deleted" });
  } catch (err) {
    console.error("❌ deleteDocumentPage:", err.message);
    res.status(500).json({ error: "Failed to delete page" });
  }
};

// ── PUT /api/document-pages/document/:documentId/header-footer ───────────────
export const updateDocumentHeaderFooter = async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    const { documentId } = req.params;
    const { defaultHeader, defaultFooter, applyToAllPages } = req.body;

    const doc = await Document.findById(documentId).populate("company");
    if (!doc) return res.status(404).json({ error: "Document not found" });

    if (!canAccessDocument(doc, user)) {
      return res.status(403).json({ error: "Access denied — wrong company" });
    }

    if (defaultHeader !== undefined) doc.defaultHeader = defaultHeader;
    if (defaultFooter !== undefined) doc.defaultFooter = defaultFooter;
    await doc.save();

    if (applyToAllPages) {
      await Documentpage.updateMany(
        { document: documentId },
        {
          $set: {
            headerText: defaultHeader ?? doc.defaultHeader ?? "",
            footerText: defaultFooter ?? doc.defaultFooter ?? "",
          },
        }
      );
    }

    res.json({ message: "Header/footer updated", document: doc });
  } catch (err) {
    console.error("❌ updateDocumentHeaderFooter:", err.message);
    res.status(500).json({ error: "Failed to update header/footer" });
  }
};

// ── GET /api/document-pages/superadmin/all ────────────────────────────────────
export const superadminGetAll = async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    if (!isSuperAdmin(user)) {
      return res.status(403).json({ error: "Superadmin only" });
    }

    const docs = await Document.find()
      .populate("company", "name email")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    const withCounts = await Promise.all(
      docs.map(async (d) => {
        const pageCount = await Documentpage.countDocuments({ document: d._id });
        return { ...d.toObject(), pageCount };
      })
    );

    res.json(withCounts);
  } catch (err) {
    console.error("❌ superadminGetAll:", err.message);
    res.status(500).json({ error: "Failed to fetch all documents" });
  }
};