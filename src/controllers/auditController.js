import AuditLog from "../models/AuditLog.js";

// ── GET audit logs (Owner sees their company, SuperAdmin sees all) ─────────────
export const getAuditLogs = async (req, res) => {
  try {
    const { module, action, userId, page = 1, limit = 50 } = req.query;

    const filter = {};

    // Owner only sees their company logs
    if (!req.user.isSuperAdmin) {
      filter.company = req.user.companyId;
    } else if (req.query.companyId) {
      filter.company = req.query.companyId;
    }

    if (module) filter.module = module;
    if (action) filter.action = action;
    if (userId) filter["user._id"] = userId;

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await AuditLog.countDocuments(filter);
    const logs  = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    res.json({
      logs,
      total,
      page:       Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch audit logs" });
  }
};

// ── GET audit log stats (counts per module/action) ────────────────────────────
export const getAuditStats = async (req, res) => {
  try {
    const filter = req.user.isSuperAdmin ? {} : { company: req.user.companyId };

    const stats = await AuditLog.aggregate([
      { $match: filter },
      {
        $group: {
          _id:   { module: "$module", action: "$action" },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch audit stats" });
  }
};