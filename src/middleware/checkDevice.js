import crypto from "crypto";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";

/**
 * generateDeviceId — hash of userId + userAgent + IP
 * Stable per device/browser, changes if IP changes significantly
 */
export const generateDeviceId = (userId, userAgent = "", ip = "") => {
  return crypto
    .createHash("sha256")
    .update(`${userId}-${userAgent}-${ip}`)
    .digest("hex")
    .slice(0, 32);
};

/**
 * checkDevice middleware — call during LOGIN only
 * - Checks if company has hit device limit
 * - If not, adds device session to subscription
 * - If already logged in on same device, updates lastSeen
 */
export const checkDevice = async ({ userId, companyId, userAgent, ip }) => {
  try {
    if (!companyId) return { allowed: true, deviceId: null };

    const subscription = await Subscription.findOne({ company: companyId }).populate("plan");
    if (!subscription) return { allowed: true, deviceId: null };

    const plan        = subscription.plan;
    const deviceLimit = plan?.limits?.devices ?? 1;
    const deviceId    = generateDeviceId(userId, userAgent, ip);

    // -1 = unlimited devices
    if (deviceLimit === -1) {
      await upsertSession(subscription, { deviceId, userId, userAgent, ip });
      return { allowed: true, deviceId };
    }

    // Check if this device is already in sessions
    const existingSession = subscription.activeSessions.find(s => s.deviceId === deviceId);
    if (existingSession) {
      // Update lastSeen for existing session
      existingSession.lastSeen = new Date();
      await subscription.save();
      return { allowed: true, deviceId };
    }

    // Clean up stale sessions (inactive > 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    subscription.activeSessions = subscription.activeSessions.filter(
      s => new Date(s.lastSeen) > sevenDaysAgo
    );

    // Check device count after cleanup
    if (subscription.activeSessions.length >= deviceLimit) {
      return {
        allowed: false,
        deviceId,
        message: `Device limit reached. Your ${plan.displayName} plan allows ${deviceLimit} device${deviceLimit > 1 ? "s" : ""}. Please logout from another device first.`,
        limit:   deviceLimit,
        current: subscription.activeSessions.length,
      };
    }

    // Add new session
    subscription.activeSessions.push({ deviceId, userId, userAgent, ip });
    await subscription.save();

    return { allowed: true, deviceId };
  } catch (err) {
    console.error("checkDevice error:", err.message);
    return { allowed: true, deviceId: null }; // allow on error
  }
};

/**
 * removeDevice — call on LOGOUT to clean up session
 */
export const removeDevice = async (companyId, deviceId) => {
  try {
    if (!companyId || !deviceId) return;
    await Subscription.updateOne(
      { company: companyId },
      { $pull: { activeSessions: { deviceId } } }
    );
  } catch (err) {
    console.error("removeDevice error:", err.message);
  }
};

async function upsertSession(subscription, { deviceId, userId, userAgent, ip }) {
  const existing = subscription.activeSessions.find(s => s.deviceId === deviceId);
  if (existing) {
    existing.lastSeen = new Date();
  } else {
    subscription.activeSessions.push({ deviceId, userId, userAgent, ip });
  }
  await subscription.save();
}