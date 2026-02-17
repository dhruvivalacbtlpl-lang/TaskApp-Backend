const transporter = require("./mail");

const sendStaffCredentials = async ({ email, name, password }) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your TaskApp Login Credentials",
      html: `
        <h3>Hello ${name},</h3>
        <p>Your staff account has been created successfully!</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Password:</b> ${password}</p>
        <p>Please log in and change your password immediately.</p>
      `,
    });
    console.log(`Email sent to ${email} with password ${password}`);
  } catch (err) {
    console.error("Error sending email:", err);
  }
};

module.exports = { sendStaffCredentials };
