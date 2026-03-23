/**
 * subscriptionController.js
 * * Includes: 
 * - Feature Allowance (Checkboxes) support
 * - Staff limit enforcement
 * - Subscription & Plan CRUD
 */

import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import Company from "../models/Company.js";
import Staff from "../models/Staff.js";
import { logAudit } from "../utils/logAudit.js";
import { getEffectivePlan } from "../middleware/checkLimit.js";

// ── Helper: calculate end date ─────────────────────────────────────────────────
function calculateEndDate(billingCycle) {
  const d = new Date();
  switch (billingCycle) {
    case "trial":
    case "monthly": d.setMonth(d.getMonth() + 1); break;
    case "quarterly": d.setMonth(d.getMonth() + 3); break;
    case "halfYearly": d.setMonth(d.getMonth() + 6); break;
    case "yearly": d.setFullYear(d.getFullYear() + 1); break;
    default: d.setMonth(d.getMonth() + 1);
  }
  return d;
}

// ── Live usage counts from DB ──────────────────────────────────────────────────
async function buildLiveUsage(companyId) {
  const [staff, projects, tasks, issues, documents, taskStatuses] = await Promise.all([
    // ✅ FIX: $ne: false catches existing staff where isActive is undefined/null
    Staff.countDocuments({
      company: companyId,
      isOwner: false,
      isActive: { $ne: false },
    }),
    safeCount("Project", { company: companyId }),
    safeCount("Task", { company: companyId }),
    safeCount("Issue", { company: companyId }),
    safeCount("Document", { company: companyId }),
    safeCount("TaskStatus", { company: companyId }),
  ]);
  return { staff, projects, tasks, issues, documents, taskStatuses };
}

async function safeCount(modelName, filter) {
  try {
    const { default: Model } = await import(`../models/${modelName}.js`);
    return Model.countDocuments(filter);
  } catch {
    return 0;
  }
}

// ── AUTO: Assign free trial when company is created ───────────────────────────
export const assignFreeTrial = async (companyId) => {
  try {
    const freePlan = await Plan.findOne({ name: "free" });
    if (!freePlan) {
      console.error("❌ Free plan not found — run seedPlans first");
      return null;
    }

    const startDate = new Date();
    const endDate = calculateEndDate("trial");

    const subscription = await Subscription.findOneAndUpdate(
      { company: companyId },
      {
        plan: freePlan._id,
        billingCycle: "monthly",
        status: "active",
        startDate,
        endDate,
        renewedAt: startDate,
        amount: 0,
        paymentNote: "Free trial — auto-assigned on signup",
        assignedBy: null,
      },
      { upsert: true, new: true, runValidators: false }
    );
    return subscription;
  } catch (err) {
    console.error("❌ assignFreeTrial failed:", err.message);
    return null;
  }
};

// ── GET all plans (public) ─────────────────────────────────────────────────────
export const getPlans = async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const plans = await Plan.find({ isActive: true }).sort({ "pricing.monthly": 1 });
    res.json(plans);
  } catch {
    res.status(500).json({ message: "Failed to fetch plans" });
  }
};

// ── GET current company subscription + live usage ──────────────────────────────
export const getMySubscription = async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const companyId = req.user.companyId || req.user.company;

    const { plan, subscription, isExpired, isTrial } = await getEffectivePlan(companyId);
    const usage = await buildLiveUsage(companyId);

    const daysRemaining = subscription?.endDate
      ? Math.max(0, Math.ceil((new Date(subscription.endDate) - new Date()) / (1000 * 60 * 60 * 24)))
      : 0;

    res.json({
      subscription,
      plan,
      usage,
      isExpired,
      isTrial,
      isFree: plan?.name === "free",
      daysRemaining,
      // ✅ Features array for frontend checkbox checks
      allowedFeatures: plan?.features || [],
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch subscription" });
  }
};

// ── GET live usage summary ─────────────────────────────────────────────────────
export const getUsageSummary = async (req, res) => {
  try {
    const companyId = req.user?.companyId || req.user?.company;
    if (!companyId) return res.status(400).json({ message: "No company context" });

    const { plan, isExpired } = await getEffectivePlan(companyId);
    const usage = await buildLiveUsage(companyId);

    const sub = await Subscription.findOne({ company: companyId }).lean();
    const daysRemaining = sub?.endDate
      ? Math.max(0, Math.ceil((new Date(sub.endDate) - new Date()) / (1000 * 60 * 60 * 24)))
      : 0;

    const resources = ["staff", "projects", "tasks", "issues", "documents", "taskStatuses"];
    const summary = resources.map(key => ({
      resource: key,
      used: usage[key] ?? 0,
      limit: plan?.limits?.[key] ?? 0,
      unlimited: plan?.limits?.[key] === -1,
      exceeded: plan?.limits?.[key] !== -1 && (usage[key] ?? 0) >= (plan?.limits?.[key] ?? 0),
    }));

    res.json({ summary, plan, isExpired, daysRemaining });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch usage summary" });
  }
};

// ── SUPERADMIN: Get all subscriptions ─────────────────────────────────────────
export const getAllSubscriptions = async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const subscriptions = await Subscription.find()
      .populate("company", "name email logo")
      .populate("plan")
      .populate("assignedBy", "name")
      .sort({ updatedAt: -1 })
      .lean();

    const withUsage = await Promise.all(
      subscriptions.map(async (sub) => ({
        ...sub,
        usage: await buildLiveUsage(sub.company?._id),
      }))
    );

    res.json(withUsage);
  } catch {
    res.status(500).json({ message: "Failed to fetch subscriptions" });
  }
};

// ── SUPERADMIN: Assign plan to a company ──────────────────────────────────────
export const assignPlan = async (req, res) => {
  try {
    const { companyId, planId, billingCycle = "monthly", paymentNote = "Assigned by SuperAdmin" } = req.body;
    if (!companyId || !planId)
      return res.status(400).json({ message: "companyId and planId are required" });

    const [company, plan] = await Promise.all([
      Company.findById(companyId),
      Plan.findById(planId),
    ]);
    if (!company) return res.status(404).json({ message: "Company not found" });
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    const startDate = new Date();
    const endDate = calculateEndDate(billingCycle);

    const subscription = await Subscription.findOneAndUpdate(
      { company: companyId },
      {
        plan: planId,
        billingCycle,
        status: "active",
        startDate,
        endDate,
        renewedAt: startDate,
        amount: plan.pricing[billingCycle] || 0,
        paymentNote,
        assignedBy: req.user._id || req.user.id,
        $set: { activeSessions: [] },
      },
      { upsert: true, new: true, runValidators: false }
    ).populate("plan");

    const staffLimit = plan.limits?.staff ?? 0;
    if (staffLimit > 0) await enforceStaffLimit(companyId, staffLimit);

    await logAudit(req, "Subscription", "ASSIGN",
      `Assigned ${plan.displayName} plan (${billingCycle}) to ${company.name}`,
      { entityId: company._id.toString(), entityName: company.name }
    );

    res.json({ message: "Plan assigned successfully", subscription });
  } catch (err) {
    res.status(500).json({ message: "Failed to assign plan", details: err.message });
  }
};

// ── Company self-purchase plan ─────────────────────────────────────────────────
export const purchasePlan = async (req, res) => {
  try {
    const { planId, billingCycle = "monthly" } = req.body;
    const companyId = req.user.companyId || req.user.company;
    if (!planId) return res.status(400).json({ message: "planId is required" });

    const [company, plan] = await Promise.all([
      Company.findById(companyId),
      Plan.findById(planId),
    ]);
    if (!company) return res.status(404).json({ message: "Company not found" });
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    const startDate = new Date();
    const endDate = calculateEndDate(billingCycle);

    const subscription = await Subscription.findOneAndUpdate(
      { company: companyId },
      {
        plan: planId,
        billingCycle,
        status: "active",
        startDate,
        endDate,
        renewedAt: startDate,
        amount: plan.pricing[billingCycle] || 0,
        paymentNote: `Self-purchased ${plan.displayName} (${billingCycle})`,
        assignedBy: null,
        $set: { activeSessions: [] },
      },
      { upsert: true, new: true, runValidators: false }
    ).populate("plan");

    await logAudit(req, "Subscription", "PURCHASE",
      `Purchased ${plan.displayName} plan (${billingCycle})`,
      { entityId: subscription._id.toString(), entityName: plan.displayName }
    );

    res.json({ message: "Plan activated successfully", subscription });
  } catch (err) {
    res.status(500).json({ message: "Failed to purchase plan", details: err.message });
  }
};

// ── SUPERADMIN: Clear device sessions ─────────────────────────────────────────
export const clearDeviceSessions = async (req, res) => {
  try {
    const { companyId } = req.params;
    await Subscription.updateOne({ company: companyId }, { $set: { activeSessions: [] } });
    await logAudit(req, "Subscription", "UPDATE",
      `Cleared all device sessions for company`,
      { entityId: companyId }
    );
    res.json({ message: "Device sessions cleared" });
  } catch {
    res.status(500).json({ message: "Failed to clear sessions" });
  }
};

// ── CRON: Auto-expire subscriptions & enforce limits ──────────────────────────
export const checkExpiredSubscriptions = async () => {
  try {
    const now = new Date();
    const expired = await Subscription.find({
      status: "active",
      endDate: { $lt: now },
    }).populate("plan");

    for (const sub of expired) {
      sub.status = "expired";
      await sub.save();

      const freePlan = await Plan.findOne({ name: "free" }).lean();
      const freeStaffLimit = freePlan?.limits?.staff ?? 3;
      await enforceStaffLimit(sub.company.toString(), freeStaffLimit);

      console.log(`⏰ Expired for company ${sub.company} — staff trimmed to ${freeStaffLimit}`);
    }
  } catch (err) {
    console.error("❌ checkExpiredSubscriptions error:", err.message);
  }
};

// ── Helper: deactivate newest staff beyond limit ───────────────────────────────
async function enforceStaffLimit(companyId, limit) {
  if (limit === -1) return;
  const activeStaff = await Staff.find({
    company: companyId,
    isOwner: false,
    isActive: { $ne: false },
  })
    .sort({ createdAt: -1 })
    .select("_id");

  if (activeStaff.length <= limit) return;

  const excessIds = activeStaff.slice(0, activeStaff.length - limit).map(s => s._id);
  await Staff.updateMany({ _id: { $in: excessIds } }, { $set: { isActive: false } });
}

// ── Plan CRUD (SuperAdmin) ─────────────────────────────────────────────────────
export const createPlan = async (req, res) => {
  try {
    const { name, displayName, description, color, pricing, limits, features } = req.body;
    if (!name || !displayName) return res.status(400).json({ message: "name and displayName required" });

    const exists = await Plan.findOne({ name });
    if (exists) return res.status(400).json({ message: "Plan already exists" });

    // ✅ Features array saved here
    const plan = await Plan.create({ name, displayName, description, color, pricing, limits, features: features || [] });
    res.status(201).json(plan);
  } catch (err) {
    res.status(500).json({ message: "Failed to create plan", details: err.message });
  }
};

export const updatePlan = async (req, res) => {
  try {
    // ✅ $set handles the incoming 'features' checkbox array automatically
    const plan = await Plan.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: false });
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    res.json(plan);
  } catch (err) {
    res.status(500).json({ message: "Failed to update plan", details: err.message });
  }
};

export const deletePlan = async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    if (["free", "basic", "pro"].includes(plan.name))
      return res.status(400).json({ message: `Cannot delete system plan "${plan.name}".` });
    await Plan.findByIdAndDelete(req.params.id);
    res.json({ message: "Plan deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete plan" });
  }
};