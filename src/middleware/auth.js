import jwt   from "jsonwebtoken";
import Staff  from "../models/Staff.js";

export const protect = async (req, res, next) => {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const staff = await Staff.findById(decoded.id)
      .select("-password")
      .populate("role")
      .populate("company", "name status workingHours holidays");

    if (!staff) {
      return res.status(401).json({ message: "Not authorized, user not found" });
    }

    req.user    = staff;
    req.user.id = staff._id.toString(); // for backward compatibility

    next();
  } catch (err) {
    console.error("❌ Auth middleware error:", err.message);
    return res.status(401).json({ message: "Not authorized, invalid token" });
  }
};