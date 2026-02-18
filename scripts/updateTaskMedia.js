import mongoose from "mongoose";
import dotenv from "dotenv";
import Task from "../src/models/Task.js";

dotenv.config();

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("MongoDB connected"))
.catch((err) => console.error("MongoDB connection error:", err));

const updateTasks = async () => {
  try {
    const tasks = await Task.find();
    for (let task of tasks) {
      if (task.media && task.media.startsWith("http")) {
        const pathIndex = task.media.indexOf("/upload/");
        if (pathIndex !== -1) {
          const newPath = task.media.substring(pathIndex + 8); // remove '/upload/'
          task.media = newPath;
          await task.save();
          console.log(`Updated task ${task._id}: ${newPath}`);
        }
      }
    }
    console.log("All tasks updated successfully!");
    mongoose.disconnect();
  } catch (err) {
    console.error("Error updating tasks:", err);
    mongoose.disconnect();
  }
};

updateTasks();
