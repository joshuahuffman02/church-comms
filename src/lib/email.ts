import nodemailer from "nodemailer";

const HOST = process.env.SMTP_HOST, USER = process.env.SMTP_USER, PASS = process.env.SMTP_PASS;
const configured = Boolean(HOST && USER && PASS);
const transporter = configured
  ? nodemailer.createTransport({ host: HOST, port: Number(process.env.SMTP_PORT ?? 465), secure: true, auth: { user: USER, pass: PASS } })
  : null;

export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<void> {
  if (!configured || !opts.to) {
    console.log(`[email:dev] to=${opts.to} subject=${opts.subject}`); // no-op in dev / unconfigured
    return;
  }
  try {
    await transporter!.sendMail({ from: process.env.SMTP_FROM ?? USER!, ...opts });
  } catch (e) {
    console.error("[email] send failed (non-fatal):", e); // never crash a status change on email failure
  }
}
