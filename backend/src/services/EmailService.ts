import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

export interface EmailConfig {
  provider: 'smtp' | 'sendgrid' | 'ses';
  from: string;
  fromName: string;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
  };
  sendgrid?: {
    apiKey: string;
  };
  ses?: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export class EmailService {
  private static config: EmailConfig;
  private static transporter: nodemailer.Transporter | null = null;

  /**
   * Initialize email service with configuration
   */
  static initialize(config: EmailConfig): void {
    this.config = config;
    
    if (config.provider === 'smtp' && config.smtp) {
      this.transporter = nodemailer.createTransporter({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: {
          user: config.smtp.user,
          pass: config.smtp.password
        }
      });
      
      // Verify connection
      this.transporter.verify((error, success) => {
        if (error) {
          logger.error('SMTP connection failed:', error);
        } else {
          logger.info('SMTP server connected successfully');
        }
      });
    }
  }

  /**
   * Send email verification
   */
  static async sendEmailVerification(email: string, token: string): Promise<void> {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
    
    const template = this.getEmailVerificationTemplate(verificationUrl);
    
    await this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text
    });
    
    logger.info(`Email verification sent to: ${email}`);
  }

  /**
   * Send password reset email
   */
  static async sendPasswordResetEmail(email: string, firstName: string, token: string): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    
    const template = this.getPasswordResetTemplate(firstName, resetUrl);
    
    await this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text
    });
    
    logger.info(`Password reset email sent to: ${email}`);
  }

  /**
   * Send user invitation email
   */
  static async sendUserInvitation(
    email: string,
    token: string,
    organizationName: string,
    inviterName: string,
    role: string
  ): Promise<void> {
    const inviteUrl = `${process.env.FRONTEND_URL}/accept-invite?token=${token}`;
    
    const template = this.getUserInvitationTemplate(
      inviteUrl,
      organizationName,
      inviterName,
      role
    );
    
    await this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text
    });
    
    logger.info(`User invitation sent to: ${email}`);
  }

  /**
   * Send temporary password email
   */
  static async sendTemporaryPassword(
    email: string,
    firstName: string,
    tempPassword: string,
    organizationName: string
  ): Promise<void> {
    const template = this.getTemporaryPasswordTemplate(
      firstName,
      tempPassword,
      organizationName
    );
    
    await this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text
    });
    
    logger.info(`Temporary password sent to: ${email}`);
  }

  /**
   * Send welcome email for new users
   */
  static async sendWelcomeEmail(
    email: string,
    firstName: string,
    organizationName: string
  ): Promise<void> {
    const template = this.getWelcomeTemplate(firstName, organizationName);
    
    await this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text
    });
    
    logger.info(`Welcome email sent to: ${email}`);
  }

  /**
   * Send security alert email
   */
  static async sendSecurityAlert(
    email: string,
    firstName: string,
    alertType: string,
    details: any
  ): Promise<void> {
    const template = this.getSecurityAlertTemplate(firstName, alertType, details);
    
    await this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text
    });
    
    logger.info(`Security alert sent to: ${email}`);
  }

  /**
   * Generic send email function
   */
  private static async sendEmail(options: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    if (!this.config) {
      throw new Error('Email service not initialized');
    }

    const mailOptions = {
      from: `${this.config.fromName} <${this.config.from}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text
    };

    try {
      if (this.config.provider === 'smtp' && this.transporter) {
        await this.transporter.sendMail(mailOptions);
      } else {
        // For now, just log the email (implement SendGrid/SES as needed)
        logger.info('Email would be sent:', {
          to: options.to,
          subject: options.subject,
          provider: this.config.provider
        });
      }
    } catch (error) {
      logger.error('Failed to send email:', error);
      throw new Error('Failed to send email');
    }
  }

  // Email template methods
  
  private static getEmailVerificationTemplate(verificationUrl: string): EmailTemplate {
    return {
      subject: 'Verify your ETrax account',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Verify your ETrax account</title>
        </head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
            <h1 style="color: #2563eb; margin-bottom: 20px;">Verify Your Email Address</h1>
            <p>Thank you for signing up for ETrax! Please verify your email address by clicking the button below:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Verify Email Address</a>
            </div>
            <p>If you can't click the button, copy and paste this URL into your browser:</p>
            <p style="word-break: break-all; color: #6b7280;">${verificationUrl}</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px;">If you didn't create an ETrax account, you can safely ignore this email.</p>
          </div>
        </body>
        </html>
      `,
      text: `
        Verify Your Email Address
        
        Thank you for signing up for ETrax! Please verify your email address by visiting this URL:
        
        ${verificationUrl}
        
        If you didn't create an ETrax account, you can safely ignore this email.
      `
    };
  }

  private static getPasswordResetTemplate(firstName: string, resetUrl: string): EmailTemplate {
    return {
      subject: 'Reset your ETrax password',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Reset your ETrax password</title>
        </head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
            <h1 style="color: #dc2626; margin-bottom: 20px;">Password Reset Request</h1>
            <p>Hi ${firstName},</p>
            <p>We received a request to reset your ETrax password. Click the button below to create a new password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
            </div>
            <p>If you can't click the button, copy and paste this URL into your browser:</p>
            <p style="word-break: break-all; color: #6b7280;">${resetUrl}</p>
            <p>This link will expire in 1 hour for security reasons.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px;">If you didn't request a password reset, you can safely ignore this email.</p>
          </div>
        </body>
        </html>
      `,
      text: `
        Password Reset Request
        
        Hi ${firstName},
        
        We received a request to reset your ETrax password. Visit this URL to create a new password:
        
        ${resetUrl}
        
        This link will expire in 1 hour for security reasons.
        
        If you didn't request a password reset, you can safely ignore this email.
      `
    };
  }

  private static getUserInvitationTemplate(
    inviteUrl: string,
    organizationName: string,
    inviterName: string,
    role: string
  ): EmailTemplate {
    return {
      subject: `You've been invited to join ${organizationName} on ETrax`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Invitation to join ${organizationName}</title>
        </head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
            <h1 style="color: #059669; margin-bottom: 20px;">You're Invited!</h1>
            <p>${inviterName} has invited you to join <strong>${organizationName}</strong> on ETrax as a <strong>${role}</strong>.</p>
            <p>ETrax is a comprehensive equipment tracking and management system that helps organizations manage their inventory efficiently.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${inviteUrl}" style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Accept Invitation</a>
            </div>
            <p>If you can't click the button, copy and paste this URL into your browser:</p>
            <p style="word-break: break-all; color: #6b7280;">${inviteUrl}</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px;">This invitation will expire in 7 days. If you weren't expecting this invitation, you can safely ignore this email.</p>
          </div>
        </body>
        </html>
      `,
      text: `
        You're Invited to Join ${organizationName}!
        
        ${inviterName} has invited you to join ${organizationName} on ETrax as a ${role}.
        
        Accept your invitation by visiting this URL:
        
        ${inviteUrl}
        
        This invitation will expire in 7 days. If you weren't expecting this invitation, you can safely ignore this email.
      `
    };
  }

  private static getTemporaryPasswordTemplate(
    firstName: string,
    tempPassword: string,
    organizationName: string
  ): EmailTemplate {
    return {
      subject: 'Your temporary ETrax password',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Your temporary ETrax password</title>
        </head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
            <h1 style="color: #2563eb; margin-bottom: 20px;">Welcome to ETrax!</h1>
            <p>Hi ${firstName},</p>
            <p>Your account has been created for <strong>${organizationName}</strong>. Here are your login credentials:</p>
            <div style="background-color: #ffffff; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #2563eb;">
              <p><strong>Temporary Password:</strong> <code style="background-color: #f3f4f6; padding: 2px 6px; border-radius: 3px;">${tempPassword}</code></p>
            </div>
            <p><strong>Important:</strong> Please change this temporary password after your first login for security.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/login" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Login to ETrax</a>
            </div>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px;">If you have any questions, please contact your administrator.</p>
          </div>
        </body>
        </html>
      `,
      text: `
        Welcome to ETrax!
        
        Hi ${firstName},
        
        Your account has been created for ${organizationName}. Here are your login credentials:
        
        Temporary Password: ${tempPassword}
        
        Important: Please change this temporary password after your first login for security.
        
        Login at: ${process.env.FRONTEND_URL}/login
        
        If you have any questions, please contact your administrator.
      `
    };
  }

  private static getWelcomeTemplate(firstName: string, organizationName: string): EmailTemplate {
    return {
      subject: 'Welcome to ETrax!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Welcome to ETrax!</title>
        </head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
            <h1 style="color: #059669; margin-bottom: 20px;">Welcome to ETrax!</h1>
            <p>Hi ${firstName},</p>
            <p>Welcome to <strong>${organizationName}</strong>'s ETrax system! You now have access to our comprehensive equipment tracking and management platform.</p>
            <p>With ETrax, you can:</p>
            <ul>
              <li>Track equipment check-in and check-out</li>
              <li>Generate QR codes for easy equipment identification</li>
              <li>View equipment status and availability</li>
              <li>Generate reports and analytics</li>
              <li>Manage equipment maintenance and workflows</li>
            </ul>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/dashboard" style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Go to Dashboard</a>
            </div>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px;">If you need help getting started, check out our documentation or contact your administrator.</p>
          </div>
        </body>
        </html>
      `,
      text: `
        Welcome to ETrax!
        
        Hi ${firstName},
        
        Welcome to ${organizationName}'s ETrax system! You now have access to our comprehensive equipment tracking and management platform.
        
        With ETrax, you can:
        - Track equipment check-in and check-out
        - Generate QR codes for easy equipment identification  
        - View equipment status and availability
        - Generate reports and analytics
        - Manage equipment maintenance and workflows
        
        Go to your dashboard: ${process.env.FRONTEND_URL}/dashboard
        
        If you need help getting started, check out our documentation or contact your administrator.
      `
    };
  }

  private static getSecurityAlertTemplate(
    firstName: string,
    alertType: string,
    details: any
  ): EmailTemplate {
    let message = '';
    let color = '#dc2626';
    
    switch (alertType) {
      case 'login_from_new_device':
        message = `We detected a login to your account from a new device: ${details.device || 'Unknown device'} at ${details.location || 'Unknown location'}.`;
        break;
      case 'password_changed':
        message = 'Your account password was changed.';
        break;
      case 'multiple_failed_logins':
        message = `We detected ${details.attempts || 'multiple'} failed login attempts on your account.`;
        break;
      case 'account_locked':
        message = 'Your account has been temporarily locked due to multiple failed login attempts.';
        break;
      default:
        message = 'We detected unusual activity on your account.';
    }

    return {
      subject: 'ETrax Security Alert',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>ETrax Security Alert</title>
        </head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
            <h1 style="color: ${color}; margin-bottom: 20px;">🔒 Security Alert</h1>
            <p>Hi ${firstName},</p>
            <p>${message}</p>
            <p><strong>Time:</strong> ${details.timestamp || new Date().toISOString()}</p>
            ${details.ipAddress ? `<p><strong>IP Address:</strong> ${details.ipAddress}</p>` : ''}
            ${details.userAgent ? `<p><strong>Device:</strong> ${details.userAgent}</p>` : ''}
            <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 15px; margin: 20px 0;">
              <p style="margin: 0;"><strong>What should you do?</strong></p>
              <ul style="margin: 10px 0 0 0;">
                <li>If this was you, no action is needed</li>
                <li>If this wasn't you, change your password immediately</li>
                <li>Review your account activity</li>
                <li>Contact your administrator if you need help</li>
              </ul>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/security" style="background-color: ${color}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Review Account Security</a>
            </div>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px;">This is an automated security notification. If you have concerns, please contact your administrator.</p>
          </div>
        </body>
        </html>
      `,
      text: `
        Security Alert
        
        Hi ${firstName},
        
        ${message}
        
        Time: ${details.timestamp || new Date().toISOString()}
        ${details.ipAddress ? `IP Address: ${details.ipAddress}` : ''}
        ${details.userAgent ? `Device: ${details.userAgent}` : ''}
        
        What should you do?
        - If this was you, no action is needed
        - If this wasn't you, change your password immediately
        - Review your account activity
        - Contact your administrator if you need help
        
        Review your account security: ${process.env.FRONTEND_URL}/security
        
        This is an automated security notification. If you have concerns, please contact your administrator.
      `
    };
  }
}