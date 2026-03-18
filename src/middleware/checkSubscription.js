import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";

/**
 * checkSubscription middleware
 * - Attaches subscription + plan to req.subscription and req.plan
 * - Returns 403 SUBSCRIPTION_EXPIRED if plan has expired
 * - SuperAdmin bypasses this check entirely
 * - Free plan companies always pass (no expiry)
 */
export const checkSubscription = async (req, res, next) => {
  try {
    // SuperAdmin bypasses all subscription checks
    if (req.user?.isSuperAdmin) return next();

    const companyId = req.user?.companyId;
    if (!companyId) return next(); // no company = skip

    const subscription = await Subscription.findOne({ company: companyId })
      .populate("plan")
      .lean();

    // No subscription found — treat as free plan, allow through
    if (!subscription) {
      req.subscription = null;
      req.plan         = null;
      return next();
    }

    // Attach to request for use in other middleware
    req.subscription = subscription;
    req.plan         = subscription.plan;

    // Check expiry (free plan never expires)
    const isFree    = subscription.plan?.name === "free";
    const isExpired = new Date() > new Date(subscription.endDate);

    if (!isFree && isExpired) {
      return res.status(403).json({
        code:    "SUBSCRIPTION_EXPIRED",
        message: "Your subscription has expired. Please renew to continue.",
        expiredAt: subscription.endDate,
      });
    }

    next();
  } catch (err) {
    console.error("checkSubscription error:", err.message);
    next(); // don't block on middleware error
  }
};