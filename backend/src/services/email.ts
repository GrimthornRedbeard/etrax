import nodemailer from 'nodemailer';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';

// Email transporter configuration
const createTransporter = () => {
  if (!config.email.host) {
    logger.warn('Email configuration not provided, using console transport');
    return nodemailer.createTransporter({
      streamTransport: true,
      newline: 'unix',
      buffer: true,
    });
  }

  return nodemailer.createTransporter({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.port === 465,
    auth: config.email.user && config.email.pass ? {
      user: config.email.user,
      pass: config.email.pass,
    } : undefined,
  });
};

const transporter = createTransporter();

// Email templates
const emailTemplates = {
  emailVerification: (firstName: string, verificationLink: string) => ({
    subject: 'Verify Your ETrax Account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1f2937;">Welcome to ETrax, ${firstName}!</h1>
        <p>Please click the link below to verify your email address:</p>
        <p>
          <a href="${verificationLink}" 
             style="background: #0ea5e9; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 4px; display: inline-block;">
            Verify Email Address
          </a>
        </p>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't create an account, please ignore this email.</p>
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 14px;">
          ETrax - Sports Equipment Inventory Management<br>
          This is an automated message, please do not reply.
        </p>
      </div>
    `,
    text: `
      Welcome to ETrax, ${firstName}!
      
      Please verify your email address by clicking this link:
      ${verificationLink}
      
      This link will expire in 24 hours.
      
      If you didn't create an account, please ignore this email.
    `,
  }),

  passwordReset: (firstName: string, resetLink: string) => ({
    subject: 'Reset Your ETrax Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1f2937;">Password Reset Request</h1>
        <p>Hello ${firstName},</p>
        <p>You requested to reset your password for your ETrax account. Click the link below to set a new password:</p>
        <p>
          <a href="${resetLink}" 
             style="background: #dc2626; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 4px; display: inline-block;">
            Reset Password
          </a>
        </p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this reset, please ignore this email. Your password will remain unchanged.</p>
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 14px;">
          ETrax - Sports Equipment Inventory Management<br>
          This is an automated message, please do not reply.
        </p>
      </div>
    `,
    text: `
      Hello ${firstName},
      
      You requested to reset your password for your ETrax account.
      Click this link to set a new password: ${resetLink}
      
      This link will expire in 1 hour.
      
      If you didn't request this reset, please ignore this email.
    `,
  }),
};

// Send email verification
export const sendEmailVerification = async (
  email: string,
  firstName: string,
  verificationToken: string
) => {
  try {
    const verificationLink = `${config.frontend.url}/verify-email?token=${verificationToken}`;
    const template = emailTemplates.emailVerification(firstName, verificationLink);

    const info = await transporter.sendMail({
      from: `"ETrax" <noreply@etrax.app>`,
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    logger.info('Email verification sent', { 
      to: email, 
      messageId: info.messageId 
    });
    
    return true;
  } catch (error) {
    logger.error('Failed to send email verification', error);
    return false;
  }
};

// Send password reset email
export const sendPasswordResetEmail = async (
  email: string,
  firstName: string,
  resetToken: string
) => {
  try {
    const resetLink = `${config.frontend.url}/reset-password?token=${resetToken}`;
    const template = emailTemplates.passwordReset(firstName, resetLink);

    const info = await transporter.sendMail({
      from: `"ETrax" <noreply@etrax.app>`,
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    logger.info('Password reset email sent', { 
      to: email, 
      messageId: info.messageId 
    });
    
    return true;
  } catch (error) {
    logger.error('Failed to send password reset email', error);
    return false;
  }
};

// Welcome email for new users
export const sendWelcomeEmail = async (
  email: string,
  firstName: string,
  schoolName?: string
) => {
  try {
    const welcomeMessage = schoolName 
      ? `Welcome to ETrax at ${schoolName}!`
      : 'Welcome to ETrax!';

    const info = await transporter.sendMail({
      from: `"ETrax" <noreply@etrax.app>`,
      to: email,
      subject: welcomeMessage,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1f2937;">${welcomeMessage}</h1>
          <p>Hi ${firstName},</p>
          <p>Your account has been successfully created. You can now access all features of ETrax including:</p>
          <ul>
            <li>Equipment inventory management</li>
            <li>QR code generation and scanning</li>
            <li>Voice commands for quick updates</li>
            <li>Real-time equipment tracking</li>
          </ul>
          <p>Get started by logging in to your account:</p>
          <p>
            <a href="${config.frontend.url}/login" 
               style="background: #0ea5e9; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 4px; display: inline-block;">
              Login to ETrax
            </a>
          </p>
          <p>If you have any questions, please don't hesitate to contact our support team.</p>
          <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 14px;">
            ETrax - Sports Equipment Inventory Management<br>
            This is an automated message, please do not reply.
          </p>
        </div>
      `,
    });

    logger.info('Welcome email sent', { 
      to: email, 
      messageId: info.messageId 
    });
    
    return true;
  } catch (error) {
    logger.error('Failed to send welcome email', error);
    return false;
  }
};