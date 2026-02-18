import nodemailer from "nodemailer";

const createTransporter = () => {
  const { EMAIL_USER, EMAIL_PASS } = process.env;
  if (!EMAIL_USER || !EMAIL_PASS)
    throw new Error("Email credentials missing");

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
};

/* ================= STAFF ACCOUNT MAIL ================= */
export const sendStaffMail = async (email, password) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Staff Account Created",
    html: `
      <h3>Your Staff Account</h3>
      <p><b>Email:</b> ${email}</p>
      <p><b>Password:</b> ${password}</p>
      <p>Please login and change your password immediately.</p>
    `,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log("✅ Staff email sent:", info.response);
};

/* ================= TASK ASSIGNMENT MAIL ================= */
export const sendTaskMail = async ({
  email,
  taskName,
  description,
  status,
  assignedBy,
}) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `New Task Assigned: ${taskName}`,
    html: `
      <h3>You have been assigned a task</h3>
      <p><b>Task:</b> ${taskName}</p>
      <p><b>Description:</b> ${description}</p>
      <p><b>Status:</b> ${status}</p>
      <p><b>Assigned By:</b> ${assignedBy}</p>
      <br/>
      <p>Please login to the system to view details.</p>
    `,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log("✅ Task email sent:", info.response);
};
