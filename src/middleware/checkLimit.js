/**
 * checkLimit.js  —  middleware/checkLimit.js
 *
 * ✅ FIX: Staff count uses { isActive: { $ne: false } } instead of { isActive: true }
 *         so existing staff without the isActive field are counted correctly.
 */

import Subscription from "../models/Subscription.js";
import Staff        from "../models/Staff.js";
import Plan         from "../models/Plan.js";

// ── Live counts from DB ────────────────────────────────────────────────────────
async function getLiveCount(resource, companyId) {
  switch (resource) {
    case "staff":
      // ✅ FIX: $ne: false catches undefined/null (old records) AND true
      return Staff.countDocuments({
        company:  companyId,
        isOwner:  false,
        isActive: { $ne: false },
      });

    case "projects": {
      const { default: Project } = await import("../models/Project.js");
      return Project.countDocuments({ company: companyId });
    }
    case "tasks": {
      const { default: Task } = await import("../models/Task.js");
      return Task.countDocuments({ company: companyId });
    }
    case "issues": {
      const { default: Issue } = await import("../models/Issue.js");
      return Issue.countDocuments({ company: companyId });
    }
    case "documents": {
      const { default: Document } = await import("../models/Document.js");
      return Document.countDocuments({ company: companyId });
    }
    case "taskStatuses": {
      const { default: TaskStatus } = await import("../models/TaskStatus.js");
      return TaskStatus.countDocuments({ company: companyId });
    }
    default:
      return 0;
  }
}

/**
 * Deactivate the most recently created staff beyond the plan limit.
 * Never deactivates the owner.
 */
async function deactivateExcessStaff(companyId, limit) {
  if (limit <= 0) return;

  // ✅ FIX: same $ne: false filter so we catch all active staff correctly
  const activeStaff = await Staff.find({
    company:  companyId,
    isOwner:  false,
    isActive: { $ne: false },
  })
    .sort({ createdAt: -1 })
    .select("_id name createdAt");

  if (activeStaff.length <= limit) return;

  const excessCount  = activeStaff.length - limit;
  const toDeactivate = activeStaff.slice(0, excessCount).map(s => s._id);

  await Staff.updateMany(
    { _id: { $in: toDeactivate } },
    { $set: { isActive: false } }
  );

  console.log(`⚠️  Deactivated ${excessCount} excess staff for company ${companyId}`);
}

/**
 * Resolve the effective plan for a company.
 * Falls back to the free plan if no subscription exists or it's expired.
 */
export async function getEffectivePlan(companyId) {
  const sub = await Subscription.findOne({ company: companyId })
    .populate("plan")
    .lean();

  if (!sub || !sub.plan) {
    const freePlan = await Plan.findOne({ name: "free" }).lean();
    return { plan: freePlan, subscription: null, isExpired: false, isTrial: false };
  }

  const now       = new Date();
  const isExpired = sub.status === "expired" || now > new Date(sub.endDate);
  const isTrial   = sub.plan.name === "free";

  if (isExpired) {
    const freePlan = await Plan.findOne({ name: "free" }).lean();
    return { plan: freePlan, subscription: sub, isExpired: true, isTrial };
  }

  return { plan: sub.plan, subscription: sub, isExpired: false, isTrial };
}

/**
 * Main middleware factory.
 * @param {string} resource — key from plan.limits
 */
export const checkLimit = (resource) => async (req, res, next) => {
  try {
    if (req.user?.isSuperAdmin) return next();

    const companyId = req.user?.companyId || req.user?.company;
    if (!companyId) return res.status(400).json({ message: "Company context missing" });

    const { plan, isExpired } = await getEffectivePlan(companyId);

    // ── Subscription expired ─────────────────────────────────────────────────
    if (isExpired) {
      return res.status(403).json({
        code:    "SUBSCRIPTION_EXPIRED",
        message: "Your subscription has expired. Please choose a plan to continue.",
      });
    }

    const limit = plan?.limits?.[resource] ?? 0;
    if (limit === -1) return next(); // unlimited

    const currentCount = await getLiveCount(resource, companyId);

    // ── Staff: deactivate excess then re-check ───────────────────────────────
    if (resource === "staff") {
      await deactivateExcessStaff(companyId, limit);
      const newCount = await getLiveCount("staff", companyId);
      if (newCount >= limit) {
        return res.status(403).json({
          code:     "LIMIT_REACHED",
          resource,
          limit,
          current:  newCount,
          message:  `Your plan allows ${limit} active staff. Upgrade to add more.`,
        });
      }
      return next();
    }

    // ── All other resources ──────────────────────────────────────────────────
    if (currentCount >= limit) {
      return res.status(403).json({
        code:     "LIMIT_REACHED",
        resource,
        limit,
        current:  currentCount,
        message:  `You've reached the ${resource} limit (${limit}) on your current plan. Upgrade to add more.`,
      });
    }

    next();
  } catch (err) {
    console.error("checkLimit error:", err);
    res.status(500).json({ message: "Server error checking plan limits" });
  }
};

/**
 * Middleware: block ALL write actions when subscription is expired.
 */
export const requireActiveSubscription = async (req, res, next) => {
  try {
    if (req.user?.isSuperAdmin) return next();
    if (req.method === "GET")   return next();

    const companyId = req.user?.companyId || req.user?.company;
    if (!companyId) return next();

    const { isExpired } = await getEffectivePlan(companyId);
    if (isExpired) {
      return res.status(403).json({
        code:    "SUBSCRIPTION_EXPIRED",
        message: "Your subscription has expired. Please upgrade your plan.",
      });
    }
    next();
  } catch {
    next();
  }
};