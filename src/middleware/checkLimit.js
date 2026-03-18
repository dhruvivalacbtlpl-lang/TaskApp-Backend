import Subscription from "../models/Subscription.js";
import UsageLog from "../models/UsageLog.js";
import Plan from "../models/Plan.js";

/**
 * checkLimit(resource)
 * Factory — returns middleware that checks if company can create more of `resource`
 *
 * Usage in routes:
 *   router.post("/", protect, checkSubscription, checkLimit("tasks"), createTask);
 *
 * Resources: "staff" | "projects" | "teamMembers" | "tasks" | "issues" | "documents" | "taskStatuses"
 */
export const checkLimit = (resource) => async (req, res, next) => {
  try {
    // SuperAdmin has no limits
    if (req.user?.isSuperAdmin) return next();

    const companyId = req.user?.companyId;
    if (!companyId) return next();

    // Get subscription and plan (already attached by checkSubscription if used together)
    let plan = req.plan;
    let subscription = req.subscription;

    if (!plan) {
      subscription = await Subscription.findOne({ company: companyId }).populate("plan").lean();
      plan = subscription?.plan || null;
    }

    // No subscription → use free plan limits
    if (!plan) {
      const freePlan = await Plan.findOne({ name: "free" }).lean();
      plan = freePlan;
    }

    if (!plan) return next(); // no plans seeded yet, allow through

    const limit = plan.limits?.[resource];

    // -1 = unlimited
    if (limit === -1 || limit === undefined) return next();

    // Get current usage for this billing period
    const now = new Date();
    const periodStart = subscription?.startDate
      ? new Date(subscription.startDate)
      : new Date(now.getFullYear(), now.getMonth(), 1);

    let usageLog = await UsageLog.findOne({
      company: companyId,
      periodStart: { $lte: now },
      periodEnd:   { $gte: now },
    }).lean();

    const currentUsage = usageLog?.usage?.[resource] || 0;

    if (currentUsage >= limit) {
      return res.status(403).json({
        code:     "LIMIT_EXCEEDED",
        resource,
        limit,
        current:  currentUsage,
        message:  `You've reached your ${resource} limit (${limit}) on your current plan. Please upgrade to add more.`,
        planName: plan.displayName,
      });
    }

    // Attach helper to increment usage after successful creation
    req.incrementUsage = async () => {
      try {
        const periodEnd = subscription?.endDate
          ? new Date(subscription.endDate)
          : new Date(now.getFullYear(), now.getMonth() + 1, 0);

        await UsageLog.findOneAndUpdate(
          {
            company:      companyId,
            periodStart:  { $lte: now },
            periodEnd:    { $gte: now },
          },
          {
            $inc: { [`usage.${resource}`]: 1 },
            $setOnInsert: {
              company:      companyId,
              subscription: subscription?._id || null,
              periodStart,
              periodEnd,
            },
          },
          { upsert: true, new: true }
        );
      } catch (err) {
        console.error("incrementUsage error:", err.message);
      }
    };

    next();
  } catch (err) {
    console.error("checkLimit error:", err.message);
    next(); // don't block on middleware error
  }
};