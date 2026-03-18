import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import UsageLog from "../models/UsageLog.js";
import Company from "../models/Company.js";
import { logAudit } from "../utils/logAudit.js";

// ── GET all plans (public) ────────────────────────────────────────────────────
export const getPlans = async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const plans = await Plan.find({ isActive: true }).sort({ "pricing.monthly": 1 });
    res.json(plans);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch plans" });
  }
};

// ── GET current company subscription + usage ──────────────────────────────────
export const getMySubscription = async (req, res) => {
  try {
    res.set("Cache-Control", "no-store"); // always fresh
    const companyId = req.user.companyId;

    const subscription = await Subscription.findOne({ company: companyId })
      .populate("plan")
      .populate("assignedBy", "name email")
      .lean();

    if (!subscription) {
      // No subscription — return free plan info
      const freePlan = await Plan.findOne({ name: "free" }).lean();
      return res.json({
        subscription: null,
        plan:         freePlan,
        usage:        {},
        isExpired:    false,
        isFree:       true,
      });
    }

    // Get current usage log
    const now = new Date();
    const usageLog = await UsageLog.findOne({
      company:     companyId,
      periodStart: { $lte: now },
      periodEnd:   { $gte: now },
    }).lean();

    const isExpired = subscription.status === "expired" ||
                      new Date() > new Date(subscription.endDate);

    res.json({
      subscription,
      plan:      subscription.plan,
      usage:     usageLog?.usage || {},
      isExpired,
      isFree:    subscription.plan?.name === "free",
      deviceCount: subscription.activeSessions?.length || 0,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch subscription" });
  }
};

// ── SUPERADMIN: Get all company subscriptions ─────────────────────────────────
export const getAllSubscriptions = async (req, res) => {
  try {
    // Always bypass cache — superadmin needs real-time data
    res.set("Cache-Control", "no-store");

    const subscriptions = await Subscription.find()
      .populate("company", "name email logo")
      .populate("plan")
      .populate("assignedBy", "name")
      .sort({ updatedAt: -1 }) // sort by most recently updated
      .lean();

    res.json(subscriptions);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch subscriptions" });
  }
};

// ── SUPERADMIN: Assign plan to a company ──────────────────────────────────────
export const assignPlan = async (req, res) => {
  try {
    const { companyId, planId, billingCycle = "monthly", paymentNote = "Assigned by SuperAdmin" } = req.body;

    if (!companyId || !planId) {
      return res.status(400).json({ message: "companyId and planId are required" });
    }

    const [company, plan] = await Promise.all([
      Company.findById(companyId),
      Plan.findById(planId),
    ]);
    if (!company) return res.status(404).json({ message: "Company not found" });
    if (!plan)    return res.status(404).json({ message: "Plan not found" });

    // Calculate end date based on billing cycle
    const endDate = calculateEndDate(billingCycle);

    // Upsert subscription (update if exists, create if not)
    const subscription = await Subscription.findOneAndUpdate(
      { company: companyId },
      {
        plan,
        billingCycle,
        status:      "active",
        startDate:   new Date(),
        endDate,
        renewedAt:   new Date(),
        amount:      plan.pricing[billingCycle] || 0,
        paymentNote,
        assignedBy:  req.user._id || req.user.id,
        $set: { activeSessions: [] }, // reset sessions on plan change
      },
      { upsert: true, new: true, runValidators: true }
    ).populate("plan");

    // Reset usage log for new period
    await UsageLog.findOneAndUpdate(
      { company: companyId, periodStart: { $lte: new Date() }, periodEnd: { $gte: new Date() } },
      {
        $setOnInsert: {
          company:      companyId,
          subscription: subscription._id,
          periodStart:  new Date(),
          periodEnd:    endDate,
          usage: { staff: 0, projects: 0, teamMembers: 0, tasks: 0, issues: 0, documents: 0, taskStatuses: 0 },
        },
      },
      { upsert: true }
    );

    await logAudit(req, "Subscription", "ASSIGN",
      `Assigned ${plan.displayName} plan (${billingCycle}) to ${company.name}`,
      { entityId: company._id.toString(), entityName: company.name }
    );

    res.json({ message: "Plan assigned successfully", subscription });
  } catch (err) {
    res.status(500).json({ message: "Failed to assign plan", details: err.message });
  }
};

// ── Company self-purchase plan ────────────────────────────────────────────────
export const purchasePlan = async (req, res) => {
  try {
    const { planId, billingCycle = "monthly" } = req.body;
    const companyId = req.user.companyId;

    if (!planId) return res.status(400).json({ message: "planId is required" });

    const [company, plan] = await Promise.all([
      Company.findById(companyId),
      Plan.findById(planId),
    ]);
    if (!company) return res.status(404).json({ message: "Company not found" });
    if (!plan)    return res.status(404).json({ message: "Plan not found" });

    const endDate = calculateEndDate(billingCycle);

    const subscription = await Subscription.findOneAndUpdate(
      { company: companyId },
      {
        plan:        planId,
        billingCycle,
        status:      "active",
        startDate:   new Date(),
        endDate,
        renewedAt:   new Date(),
        amount:      plan.pricing[billingCycle] || 0,
        paymentNote: `Self-purchased ${plan.displayName} (${billingCycle})`,
        assignedBy:  null,
        $set: { activeSessions: [] },
      },
      { upsert: true, new: true, runValidators: true }
    ).populate("plan");

    // Reset usage
    await UsageLog.findOneAndUpdate(
      { company: companyId, periodStart: { $lte: new Date() }, periodEnd: { $gte: new Date() } },
      {
        $setOnInsert: {
          company:      companyId,
          subscription: subscription._id,
          periodStart:  new Date(),
          periodEnd:    endDate,
          usage: { staff: 0, projects: 0, teamMembers: 0, tasks: 0, issues: 0, documents: 0, taskStatuses: 0 },
        },
      },
      { upsert: true }
    );

    await logAudit(req, "Subscription", "PURCHASE",
      `Purchased ${plan.displayName} plan (${billingCycle})`,
      { entityId: subscription._id.toString(), entityName: plan.displayName }
    );

    res.json({ message: "Plan activated successfully", subscription });
  } catch (err) {
    res.status(500).json({ message: "Failed to purchase plan", details: err.message });
  }
};

// ── SUPERADMIN: Clear device sessions for a company ───────────────────────────
export const clearDeviceSessions = async (req, res) => {
  try {
    const { companyId } = req.params;
    await Subscription.updateOne({ company: companyId }, { $set: { activeSessions: [] } });

    await logAudit(req, "Subscription", "UPDATE",
      `Cleared all device sessions for company`,
      { entityId: companyId }
    );

    res.json({ message: "Device sessions cleared" });
  } catch (err) {
    res.status(500).json({ message: "Failed to clear sessions" });
  }
};

// ── Helper: calculate end date from billing cycle ─────────────────────────────
function calculateEndDate(billingCycle) {
  const now = new Date();
  switch (billingCycle) {
    case "monthly":    return new Date(now.setMonth(now.getMonth() + 1));
    case "quarterly":  return new Date(now.setMonth(now.getMonth() + 3));
    case "halfYearly": return new Date(now.setMonth(now.getMonth() + 6));
    case "yearly":     return new Date(now.setFullYear(now.getFullYear() + 1));
    default:           return new Date(now.setMonth(now.getMonth() + 1));
  }
}

// ── CREATE Plan ───────────────────────────────────────────────────────────────
export const createPlan = async (req, res) => {
  try {
    const { name, displayName, description, color, pricing, limits, features } = req.body;
    if (!name || !displayName) return res.status(400).json({ message: "name and displayName are required" });

    const exists = await Plan.findOne({ name });
    if (exists) return res.status(400).json({ message: `Plan "${name}" already exists` });

    const plan = await Plan.create({ name, displayName, description, color, pricing, limits, features });
    res.status(201).json(plan);
  } catch (err) {
    res.status(500).json({ message: "Failed to create plan", details: err.message });
  }
};

// ── UPDATE Plan ───────────────────────────────────────────────────────────────
export const updatePlan = async (req, res) => {
  try {
    const plan = await Plan.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: false }
    );
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    res.json(plan);
  } catch (err) {
    res.status(500).json({ message: "Failed to update plan", details: err.message });
  }
};

// ── DELETE Plan ───────────────────────────────────────────────────────────────
export const deletePlan = async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    // Prevent deleting built-in plans
    if (["free","basic","pro"].includes(plan.name)) {
      return res.status(400).json({ message: `Cannot delete built-in plan "${plan.name}". You can edit it instead.` });
    }

    await Plan.findByIdAndDelete(req.params.id);
    res.json({ message: "Plan deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete plan", details: err.message });
  }
};