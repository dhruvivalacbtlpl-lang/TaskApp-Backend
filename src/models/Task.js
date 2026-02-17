import mongoose from "mongoose";

const taskSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    taskStatus: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TaskStatus",
    },
    status: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Permission",
    },
    assignee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Staff", // changed User -> Staff
        required: true,
    },
}, { timestamps: true });

// export default so import Task works in ES Modules
const Task = mongoose.model("Task", taskSchema);
export default Task;
