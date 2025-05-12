import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: 'mail.privateemail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.APP_EMAIL,
        pass: process.env.APP_EMAIL_PASSWORD,
      },
    });
  }

  async sendEmail(to: string, subject: string, html: string) {
    try {
      const res = await this.transporter.sendMail({
        from: '"Chain Match" <noreply@chain-match.app>',
        to,
        subject,
        html,
      });
      console.log(`Email sent to ${to}:`, res.messageId);
    } catch (err) {
      console.log('Error sending email:', err);
      throw new Error('Failed to send email');
    }
  }

  private getEmailFooter(): string {
    return `
      <p>If you have any questions or need assistance, feel free to reach out to our support team at 
        <a href="mailto:contact@chain-match.app" style="color: #CF29DE; text-decoration: none;">contact@chain-match.app</a>.
      </p>
      <footer style="margin-top: 20px; text-align: left; font-size: 12px; color: #888;">
        <p>Best regards,<br>The Chain Match Team</p>
        <p style="margin-top: 10px;">&copy; ${new Date().getFullYear()} Chain Match. All rights reserved.</p>
      </footer>
    `;
  }

  async sendSignUpEmail(to: string, userName: string) {
    const subject = 'Welcome to Chain Match!';
    const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <p>Hi ${userName},</p>
      <p>Welcome to <strong>Chain Match</strong>! We're thrilled to have you join our community.</p>
      <p>Here's what you can do next:</p>
      <ul style="padding-left: 20px;">
        <li>Log in to your account and complete your profile.</li>
        <li>Start exploring and connecting with like-minded individuals.</li>
        <li>Enjoy a seamless and secure dating experience.</li>
      </ul>
      <p>
        Click the button below to log in and get started:
      </p>
      <p style="text-align: center; margin: 20px 0;">
        <a href="${process.env.FRONTEND_URL}/auth/login" style="
          display: inline-block;
          padding: 10px 20px;
          font-size: 16px;
          color: #fff;
          background-color: #CF29DE;
          text-decoration: none;
          border-radius: 5px;
        ">Log In to Chain Match</a>
      </p>
      ${this.getEmailFooter()}
    </div>
  `;
    await this.sendEmail(to, subject, html);
  }

  async sendResetPasswordEmail(to: string, token: string) {
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    const subject = 'Password Reset Request';
    const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <p>Hi,</p>
      <p>We received a request to reset your password for your <strong>Chain Match</strong> account.</p>
      <p>Click the link below to reset your password:</p>
      <p style="text-align: center; margin: 20px 0;">
        <a href="${resetLink}" style="
          display: inline-block;
          padding: 10px 20px;
          font-size: 16px;
          color: #fff;
          background-color: #CF29DE;
          text-decoration: none;
          border-radius: 5px;
        ">Reset Your Password</a>
      </p>
      <p><strong>Note:</strong> This link will expire in 10 minutes for security reasons. If you do not reset your password within this time, you will need to request a new link.</p>
      <p>If you did not request this password reset, please ignore this email. Your account will remain secure, and no changes will be made.</p>
      ${this.getEmailFooter()}
    </div>
  `;
    await this.sendEmail(to, subject, html);
  }
}
