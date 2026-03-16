import jwt   from "jsonwebtoken";
import Staff  from "../models/Staff.js";

export const protect = async (req, res, next) => {
  let token = req.cookies?.token || req.headers.authorization?.split(" ")[1];

  if (!token) return res.status(401).json({ message: "No token, authorization denied" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Support ALL possible field names the JWT might have been signed with:
    // decoded.companyId  (new style)
    // decoded.company    (old style — plain ObjectId)
    // decoded.company._id (old style — populated object)
    const companyId =
      decoded.companyId ||
      (typeof decoded.company === "object" ? decoded.company?._id : decoded.company) ||
      null;

    // Also fetch fresh user from DB so we always have latest company value
    // (handles the case where admin was created before company was assigned)
    let freshCompanyId = companyId;
    if (!freshCompanyId) {
      try {
        const staffDoc = await Staff.findById(decoded.id).select("company").lean();
        freshCompanyId = staffDoc?.company || null;
      } catch { /* ignore */ }
    }

    req.user = {
      id:        decoded.id,
      _id:       decoded.id,
      isOwner:   decoded.isOwner   || false,
      role:      decoded.role      || null,
      companyId: freshCompanyId,
      company:   freshCompanyId,   // same value — staffRoutes uses .company
    };

    next();
  } catch (err) {
    res.status(401).json({ message: "Token is not valid" });
  }
};