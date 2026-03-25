import mongoose from "mongoose";

// ── DocumentPage Model ────────────────────────────────────────────────────────
// Each document can have up to 5 pages (enforced at API level).
// Pages are scoped to a Document and inherit the company from it.
// Only users of the same company (or superadmin) can see these pages.

const documentPageSchema = new mongoose.Schema(
  {
    document: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Document",
      required: true,
      index:    true,
    },

    pageNumber: {
      type:     Number,
      required: true,
      min:      1,
      max:      5,
    },

    // CKEditor HTML content (for .docx type) or plain text (for .txt type)
    pageContent: {
      type:    String,
      default: "",
    },

    // Header/footer per page — inherits from document defaults but can be overridden
    headerText: {
      type:    String,
      default: "",
    },
    footerText: {
      type:    String,
      default: "",
    },

    // Who created / last updated this page
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "Staff",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "Staff",
      default: null,
    },
  },
  { timestamps: true }   // gives createdAt + updatedAt automatically
);

// ── Compound unique index: one page number per document ───────────────────────
documentPageSchema.index({ document: 1, pageNumber: 1 }, { unique: true });

export default mongoose.model("DocumentPage", documentPageSchema);