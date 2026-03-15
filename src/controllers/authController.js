import bcryptjs from "bcryptjs";
import Staff from "../models/Staff.js";
import Company from "../models/Company.js";
import jwt from "jsonwebtoken";

/**
 * SIGNUP: Creates a new Company and a new Staff (Owner) simultaneously.
 * This handles the "Create Your Company" form.
 */
export const signup = async (req, res) => {
  try {
    const { 
      companyName, 
      companyEmail, 
      ownerName, 
      ownerEmail, 
      password, 
      phone, 
      address, 
      website 
    } = req.body;

    // 1. Validation: Check if Company Name is unique
    const existingCompany = await Company.findOne({ name: companyName });
    if (existingCompany) {
      return res.status(400).json({ message: "This company name is already taken." });
    }

    // 2. Validation: Check if this email is already an OWNER of a company
    // This prevents the "Account already exists" error for the same owner.
    // If you want to allow 1 person to own 5 companies, delete this specific check.
    const existingOwner = await Staff.findOne({ email: ownerEmail, isOwner: true });
    if (existingOwner) {
      return res.status(400).json({ message: "An account with this email already exists." });
    }

    // 3. Create the Company entity
    const newCompany = new Company({
      name: companyName,
      email: companyEmail,
      phone,
      address,
      website,
      // Default working hours setup
      workingHours: [
        { day: "monday", startTime: "09:00", endTime: "18:00", isWorking: true, breaks: [] },
        { day: "tuesday", startTime: "09:00", endTime: "18:00", isWorking: true, breaks: [] },
        { day: "wednesday", startTime: "09:00", endTime: "18:00", isWorking: true, breaks: [] },
        { day: "thursday", startTime: "09:00", endTime: "18:00", isWorking: true, breaks: [] },
        { day: "friday", startTime: "09:00", endTime: "18:00", isWorking: true, breaks: [] },
      ]
    });
    const savedCompany = await newCompany.save();

    // 4. Create the Owner (Staff) account tied to this company
    const hashedPassword = await bcryptjs.hash(password, 10);
    const newOwner = new Staff({
      name: ownerName,
      email: ownerEmail,
      password: hashedPassword,
      company: savedCompany._id, // LINKED HERE
      isOwner: true,
    });
    await newOwner.save();

    res.status(201).json({ 
      message: "Company and owner account created successfully!", 
      companyId: savedCompany._id 
    });
  } catch (err) {
    console.error("Signup Error:", err);
    res.status(500).json({ message: "Server error", details: err.message });
  }
};

/**
 * LOGIN: Authenticates user based on Email, Password, AND Company Name
 */
export const login = async (req, res) => {
  try {
    const { email, password, companyName } = req.body;

    if (!email || !password || !companyName) {
      return res.status(400).json({ message: "Email, password, and Company Name are required" });
    }

    // 1. Find the company context
    const company = await Company.findOne({ name: companyName });
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // 2. Find user within that specific company only
    const user = await Staff.findOne({ email, company: company._id }).populate("role");
    if (!user) {
      return res.status(401).json({ message: "No user found with this email in " + companyName });
    }

    // 3. Verify password
    const isMatch = await bcryptjs.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid password" });

    // 4. Create JWT including companyId for backend filters
    const token = jwt.sign(
      { id: user._id, role: user.role?.name || "staff", companyId: company._id },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "None",
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.status(200).json({ 
      message: "Login successful", 
      data: user, 
      company: { id: company._id, name: company.name } 
    });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * LOGOUT: Clears auth cookie
 */
export const logout = async (req, res) => {
  res.clearCookie("token", { httpOnly: true, secure: true, sameSite: "None" });
  res.status(200).json({ message: "Logged out successfully" });
};

/**
 * GET PROFILE: Fetches current logged-in user data
 */
export const getProfile = async (req, res) => {
  try {
    const user = await Staff.findOne({ 
      _id: req.user.id, 
      company: req.user.companyId 
    }).populate("role").populate("company");

    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};