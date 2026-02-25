// services/mail.js
import nodemailer from "nodemailer";

const createTransporter = () => {
  const { EMAIL_USER, EMAIL_PASS } = process.env;
  if (!EMAIL_USER || !EMAIL_PASS)
    throw new Error("Email credentials missing — check EMAIL_USER and EMAIL_PASS in .env");

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
};

// ─── STAFF MAIL ───────────────────────────────────────────────────────────────
export const sendStaffMail = async (email, message) => {
  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Staff Account Notification",
    text: message,
  });
  console.log("✅ Staff email sent:", info.response);
};

// ─── TASK MAIL ────────────────────────────────────────────────────────────────
export const sendTaskMail = async ({ email, taskName, description, status, assignedBy }) => {
  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: `📋 Task Assigned: ${taskName}`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#2b6cb0 0%,#3182ce 100%);padding:32px 36px 28px;">
            <p style="margin:0 0 10px;font-size:28px;">📋</p>
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Task Assigned</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">You have been assigned a new task.</p>
          </td>
        </tr>

        <!-- Task Name + Description -->
        <tr>
          <td style="padding:28px 36px 0;">
            <h2 style="margin:0 0 8px;font-size:18px;color:#1a202c;font-weight:700;">${taskName}</h2>
            <p style="margin:0;font-size:14px;color:#718096;line-height:1.6;">${description}</p>
          </td>
        </tr>

        <!-- Details -->
        <tr>
          <td style="padding:20px 36px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;border-collapse:collapse;">
              <tr>
                <td style="padding:11px 16px;background:#f7fafc;font-size:13px;color:#718096;font-weight:600;width:36%;border-bottom:1px solid #e2e8f0;">Status</td>
                <td style="padding:11px 16px;font-size:13px;color:#2d3748;border-bottom:1px solid #e2e8f0;">${status}</td>
              </tr>
              <tr>
                <td style="padding:11px 16px;background:#f7fafc;font-size:13px;color:#718096;font-weight:600;">Assigned By</td>
                <td style="padding:11px 16px;font-size:13px;color:#2d3748;">${assignedBy}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:0 36px 32px;" align="center">
            <a href="#" style="display:inline-block;background:linear-gradient(135deg,#2b6cb0,#3182ce);color:#ffffff;font-size:14px;font-weight:600;padding:12px 32px;border-radius:8px;text-decoration:none;">
              View Task →
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f7fafc;padding:18px 36px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:12px;color:#a0aec0;text-align:center;">
              This is an automated notification. Please log in to the system to view full details.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
  console.log("✅ Task email sent:", info.response);
};

// ─── ISSUE MAIL ───────────────────────────────────────────────────────────────
export const sendIssueMail = async ({
  email, assigneeName, issueName, description,
  issueType, priority, severity, status,
  project, dueDate, assignedBy,
}) => {
  const transporter = createTransporter();

  const priorityColor  = { low: "#38A169", medium: "#D69E2E", high: "#DD6B20", critical: "#E53E3E" };
  const severityColor  = { minor: "#38A169", moderate: "#D69E2E", major: "#DD6B20", critical: "#E53E3E" };
  const issueTypeColor = { bug: "#E53E3E", feature: "#3182CE", improvement: "#805AD5" };

  const pColor = priorityColor[priority]  || "#718096";
  const sColor = severityColor[severity]  || "#718096";
  const tColor = issueTypeColor[issueType] || "#718096";

  const badge = (label, color) =>
    `<span style="display:inline-block;padding:3px 12px;border-radius:999px;background:${color}22;color:${color};font-size:12px;font-weight:600;border:1px solid ${color}55;">${label}</span>`;

  const cap = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : "";

  const formattedDue = dueDate
    ? new Date(dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const info = await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: `🐛 Issue Assigned: ${issueName}`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#c53030 0%,#e53e3e 100%);padding:32px 36px 28px;">
            <p style="margin:0 0 10px;font-size:28px;">🐛</p>
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Issue Assigned</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Hi ${assigneeName || "there"}, you have been assigned an issue.</p>
          </td>
        </tr>

        <!-- Issue Name + Description -->
        <tr>
          <td style="padding:28px 36px 0;">
            <h2 style="margin:0 0 8px;font-size:18px;color:#1a202c;font-weight:700;">${issueName}</h2>
            <p style="margin:0;font-size:14px;color:#718096;line-height:1.6;">${description}</p>
          </td>
        </tr>

        <!-- Badges -->
        <tr>
          <td style="padding:16px 36px 0;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="padding-right:6px;">${badge(cap(issueType) || "Bug", tColor)}</td>
              <td style="padding-right:6px;">${badge("Priority: " + cap(priority), pColor)}</td>
              <td>${badge("Severity: " + cap(severity), sColor)}</td>
            </tr></table>
          </td>
        </tr>

        <!-- Details -->
        <tr>
          <td style="padding:20px 36px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;border-collapse:collapse;">
              ${status ? `
              <tr>
                <td style="padding:11px 16px;background:#f7fafc;font-size:13px;color:#718096;font-weight:600;width:36%;border-bottom:1px solid #e2e8f0;">Status</td>
                <td style="padding:11px 16px;font-size:13px;color:#2d3748;border-bottom:1px solid #e2e8f0;">${status}</td>
              </tr>` : ""}
              ${project ? `
              <tr>
                <td style="padding:11px 16px;background:#f7fafc;font-size:13px;color:#718096;font-weight:600;border-bottom:1px solid #e2e8f0;">Project</td>
                <td style="padding:11px 16px;font-size:13px;color:#2d3748;border-bottom:1px solid #e2e8f0;">📁 ${project}</td>
              </tr>` : ""}
              ${assignedBy ? `
              <tr>
                <td style="padding:11px 16px;background:#f7fafc;font-size:13px;color:#718096;font-weight:600;${formattedDue ? "border-bottom:1px solid #e2e8f0;" : ""}">Assigned By</td>
                <td style="padding:11px 16px;font-size:13px;color:#2d3748;${formattedDue ? "border-bottom:1px solid #e2e8f0;" : ""}">${assignedBy}</td>
              </tr>` : ""}
              ${formattedDue ? `
              <tr>
                <td style="padding:11px 16px;background:#f7fafc;font-size:13px;color:#718096;font-weight:600;">Due Date</td>
                <td style="padding:11px 16px;font-size:13px;color:#e53e3e;font-weight:600;">📅 ${formattedDue}</td>
              </tr>` : ""}
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:0 36px 32px;" align="center">
            <a href="#" style="display:inline-block;background:linear-gradient(135deg,#c53030,#e53e3e);color:#ffffff;font-size:14px;font-weight:600;padding:12px 32px;border-radius:8px;text-decoration:none;">
              View Issue →
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f7fafc;padding:18px 36px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:12px;color:#a0aec0;text-align:center;">
              This is an automated notification. Please log in to the system to view full details.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
  console.log("✅ Issue email sent:", info.response);
};

// ─── PROJECT MAIL ─────────────────────────────────────────────────────────────
export const sendProjectMail = async ({
  email, memberName, projectName, description,
  status, startDate, endDate, assignedBy,
}) => {
  const transporter = createTransporter();

  const fmt = (d) =>
    d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : null;

  const info = await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: `📁 Added to Project: ${projectName}`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#276749 0%,#38a169 100%);padding:32px 36px 28px;">
            <p style="margin:0 0 10px;font-size:28px;">📁</p>
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Added to a Project</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Hi ${memberName || "there"}, you are now part of a new project.</p>
          </td>
        </tr>

        <!-- Project Name + Description -->
        <tr>
          <td style="padding:28px 36px 0;">
            <h2 style="margin:0 0 8px;font-size:18px;color:#1a202c;font-weight:700;">${projectName}</h2>
            ${description ? `<p style="margin:0;font-size:14px;color:#718096;line-height:1.6;">${description}</p>` : ""}
          </td>
        </tr>

        <!-- Details -->
        <tr>
          <td style="padding:20px 36px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;border-collapse:collapse;">
              ${status ? `
              <tr>
                <td style="padding:11px 16px;background:#f7fafc;font-size:13px;color:#718096;font-weight:600;width:36%;border-bottom:1px solid #e2e8f0;">Status</td>
                <td style="padding:11px 16px;font-size:13px;color:#2d3748;border-bottom:1px solid #e2e8f0;">${status}</td>
              </tr>` : ""}
              ${fmt(startDate) ? `
              <tr>
                <td style="padding:11px 16px;background:#f7fafc;font-size:13px;color:#718096;font-weight:600;border-bottom:1px solid #e2e8f0;">Start Date</td>
                <td style="padding:11px 16px;font-size:13px;color:#2d3748;border-bottom:1px solid #e2e8f0;">📅 ${fmt(startDate)}</td>
              </tr>` : ""}
              ${fmt(endDate) ? `
              <tr>
                <td style="padding:11px 16px;background:#f7fafc;font-size:13px;color:#718096;font-weight:600;border-bottom:1px solid #e2e8f0;">End Date</td>
                <td style="padding:11px 16px;font-size:13px;color:#e53e3e;font-weight:600;border-bottom:1px solid #e2e8f0;">📅 ${fmt(endDate)}</td>
              </tr>` : ""}
              ${assignedBy ? `
              <tr>
                <td style="padding:11px 16px;background:#f7fafc;font-size:13px;color:#718096;font-weight:600;">Added By</td>
                <td style="padding:11px 16px;font-size:13px;color:#2d3748;">${assignedBy}</td>
              </tr>` : ""}
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:0 36px 32px;" align="center">
            <a href="#" style="display:inline-block;background:linear-gradient(135deg,#276749,#38a169);color:#ffffff;font-size:14px;font-weight:600;padding:12px 32px;border-radius:8px;text-decoration:none;">
              View Project →
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f7fafc;padding:18px 36px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:12px;color:#a0aec0;text-align:center;">
              This is an automated notification. Please log in to the system to view full details.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
  console.log("✅ Project email sent:", info.response);
};