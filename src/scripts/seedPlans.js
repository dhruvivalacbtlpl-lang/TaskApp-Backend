import mongoose from "mongoose";
import dotenv from "dotenv";
import Plan from "../models/Plan.js";

dotenv.config();

const plans = [
  {
    name:        "free",
    displayName: "Free",
    description: "Get started with basic features at no cost.",
    color:       "#6b7280",
    pricing: {
      monthly: 0, quarterly: 0, halfYearly: 0, yearly: 0,
    },
    limits: {
      staff:        3,
      projects:     2,
      teamMembers:  1,
      tasks:        20,
      issues:       20,
      documents:    5,
      taskStatuses: 3,
      bulkUpload:   0,   // disabled
      devices:      1,
    },
    features: {
      notifications:   false,
      bulkUpload:      false,
      prioritySupport: false,
    },
  },
  {
    name:        "basic",
    displayName: "Basic",
    description: "Perfect for small teams growing fast.",
    color:       "#3b82f6",
    pricing: {
      monthly:    50,
      quarterly:  135,  // 10% off
      halfYearly: 255,  // 15% off
      yearly:     480,  // 20% off
    },
    limits: {
      staff:        10,
      projects:     5,
      teamMembers:  3,
      tasks:        100,
      issues:       100,
      documents:    50,
      taskStatuses: 10,
      bulkUpload:   0,   // disabled
      devices:      3,
    },
    features: {
      notifications:   false,
      bulkUpload:      false,
      prioritySupport: false,
    },
  },
  {
    name:        "pro",
    displayName: "Pro",
    description: "Unlimited power for scaling businesses.",
    color:       "#8b5cf6",
    pricing: {
      monthly:    100,
      quarterly:  270,  // 10% off
      halfYearly: 510,  // 15% off
      yearly:     960,  // 20% off
    },
    limits: {
      staff:        50,
      projects:     -1,  // unlimited
      teamMembers:  5,
      tasks:        -1,  // unlimited
      issues:       -1,  // unlimited
      documents:    -1,  // unlimited
      taskStatuses: -1,  // unlimited
      bulkUpload:   10000,
      devices:      -1,  // unlimited
    },
    features: {
      notifications:   true,
      bulkUpload:      true,
      prioritySupport: true,
    },
  },
];

export const seedPlans = async () => {
  try {
    for (const plan of plans) {
      await Plan.findOneAndUpdate(
        { name: plan.name },
        plan,
        { upsert: true, new: true, runValidators: true }
      );
    }
    console.log("✅ Plans seeded successfully");
  } catch (err) {
    console.error("❌ Plan seeding failed:", err.message);
  }
};

// Run standalone: node src/scripts/seedPlans.js
if (process.argv[1].includes("seedPlans")) {
  mongoose.connect(process.env.MONGO_URI).then(async () => {
    await seedPlans();
    mongoose.disconnect();
  });
}