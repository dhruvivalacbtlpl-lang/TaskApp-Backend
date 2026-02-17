import nodemailer from "nodemailer";

export const sendStaffMail = async (email, password) => {
  const { EMAIL_USER, EMAIL_PASS } = process.env;
  if (!EMAIL_USER || !EMAIL_PASS) throw new Error("Email credentials missing");

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });

  const mailOptions = {
    from: EMAIL_USER,
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
