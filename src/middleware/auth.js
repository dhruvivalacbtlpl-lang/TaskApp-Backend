import jwt   from "jsonwebtoken";
import Staff  from "../models/Staff.js";

export const protect = async (req, res, next) => {
  let token = req.cookies?.token || req.headers.authorization?.split(" ")[1];

  if (!token) return res.status(401).json({ message: "No token, authorization denied" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ── ALWAYS fetch fresh data from DB so isSuperAdmin is never stale ────────
    const staffDoc = await Staff.findById(decoded.id)
      .select("isSuperAdmin isOwner role company")
      .lean();

    if (!staffDoc) {
      return res.status(401).json({ message: "User no longer exists" });
    }

    // ── SuperAdmin: no company needed ─────────────────────────────────────────
    if (staffDoc.isSuperAdmin) {
      req.user = {
        id:           decoded.id,
        _id:          decoded.id,
        isSuperAdmin: true,
        isOwner:      false,
        role:         null,
        companyId:    null,
        company:      null,
      };
      return next();
    }

    // ── Normal user ───────────────────────────────────────────────────────────
    const companyId = staffDoc.company?.toString() || null;

    req.user = {
      id:           decoded.id,
      _id:          decoded.id,
      isSuperAdmin: false,
      isOwner:      staffDoc.isOwner || false,
      role:         staffDoc.role    || null,
      companyId:    companyId,
      company:      companyId,
    };

    next();
  } catch (err) {
    res.status(401).json({ message: "Token is not valid" });
  }
};

/**
 * Blocks non-superadmins from a route entirely.
 * Usage: router.get("/all", protect, superAdminOnly, handler)
 */
export const superAdminOnly = (req, res, next) => {
  if (!req.user?.isSuperAdmin) {
    return res.status(403).json({ message: "SuperAdmin access required" });
  }
  next();
};