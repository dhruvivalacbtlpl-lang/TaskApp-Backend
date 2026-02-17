const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");

const app = express();

// Middlewares
app.use(express.json());
app.use(cookieParser());

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

// MongoDB connection
mongoose
  .connect("mongodb://localhost:27017/taskapp")
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error(err));

// Routes

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

module.exports = app;
