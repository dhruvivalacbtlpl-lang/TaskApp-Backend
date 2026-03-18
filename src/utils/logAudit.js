import AuditLog from "../models/AuditLog.js";
import Staff    from "../models/Staff.js";

/**
 * logAudit — call this from any controller after an action
 *
 * @param {Object} req         — Express request (for user + ip info)
 * @param {string} module      — "Task" | "Staff" | "Project" | etc.
 * @param {string} action      — "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | etc.
 * @param {string} description — Human readable: "Created task 'Fix bug'"
 * @param {Object} metadata    — Optional { entityId, entityName, before, after }
 */
export const logAudit = async (req, module, action, description, metadata = {}) => {
  try {
    const user = req?.user || null;
    if (!user) return;

    const userId = user._id || user.id;

    // ── Fetch name from DB if not on req.user (protect middleware doesn't set name) ──
    let userName = user.name || null;
    if (!userName && userId) {
      try {
        const staffDoc = await Staff.findById(userId).select("name").lean();
        userName = staffDoc?.name || "Unknown";
      } catch {
        userName = "Unknown";
      }
    }

    await AuditLog.create({
      user: {
        _id:  userId,
        name: userName,
        role: user.isSuperAdmin ? "SuperAdmin"
            : user.isOwner      ? "Owner"
            : user.role?.name   || "Staff",
      },
      company:     user.companyId || null,
      action,
      module,
      description,
      metadata: {
        entityId:   metadata.entityId   || null,
        entityName: metadata.entityName || null,
        before:     metadata.before     || null,
        after:      metadata.after      || null,
      },
      ip:        (() => {
        const raw = req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim()
          || req.ip
          || req.socket?.remoteAddress
          || null;
        // Normalize IPv6 loopback ::1 and ::ffff: prefix to readable IPv4
        if (!raw) return null;
        if (raw === "::1") return "127.0.0.1";
        if (raw.startsWith("::ffff:")) return raw.replace("::ffff:", "");
        return raw;
      })(),
      userAgent: req.headers?.["user-agent"] || null,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error("⚠️  Audit log failed:", err.message);
  }
};