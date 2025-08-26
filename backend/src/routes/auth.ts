import express from 'express';
import passport from 'passport';
import { AuthService } from '../services/auth/AuthService';
import { OAuth2Service } from '../services/auth/OAuth2Service';
import { SAMLService } from '../services/auth/SAMLService';
import { UserManagementService } from '../services/auth/UserManagementService';
import { JWTService } from '../services/auth/JWTService';
import { authenticate, authorize, requireRole, auditLog } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { logger } from '../utils/logger';
import { z } from 'zod';

const router = express.Router();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  organizationId: z.string().uuid().optional(),
  deviceInfo: z.any().optional()
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  organizationId: z.string().uuid().optional(),
  role: z.string().optional(),
  inviteToken: z.string().optional()
});

const passwordResetRequestSchema = z.object({
  email: z.string().email(),
  organizationId: z.string().uuid().optional()
});

const passwordResetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1)
});

// === LOCAL AUTHENTICATION ROUTES ===

/**
 * POST /auth/login - Local authentication
 */
router.post('/login', 
  validateRequest(loginSchema),
  auditLog('login_attempt', 'authentication'),
  async (req, res) => {
    try {
      const result = await AuthService.login(req.body);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Login error:', error);
      res.status(401).json({
        success: false,
        error: error instanceof Error ? error.message : 'Login failed'
      });
    }
  }
);

/**
 * POST /auth/register - User registration
 */
router.post('/register',
  validateRequest(registerSchema),
  auditLog('register_attempt', 'authentication'),
  async (req, res) => {
    try {
      const result = await AuthService.register(req.body);
      
      res.status(201).json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Registration error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed'
      });
    }
  }
);

/**
 * POST /auth/logout - Logout user
 */
router.post('/logout',
  authenticate,
  auditLog('logout', 'authentication'),
  async (req, res) => {
    try {
      await AuthService.logout(req.user!.id, req.user!.sessionId);
      
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      logger.error('Logout error:', error);
      res.status(500).json({
        success: false,
        error: 'Logout failed'
      });
    }
  }
);

/**
 * POST /auth/logout-all - Logout from all devices
 */
router.post('/logout-all',
  authenticate,
  auditLog('logout_all', 'authentication'),
  async (req, res) => {
    try {
      await AuthService.logoutAll(req.user!.id);
      
      res.json({
        success: true,
        message: 'Logged out from all devices'
      });
    } catch (error) {
      logger.error('Logout all error:', error);
      res.status(500).json({
        success: false,
        error: 'Logout failed'
      });
    }
  }
);

/**
 * POST /auth/refresh - Refresh access token
 */
router.post('/refresh',
  validateRequest(refreshTokenSchema),
  async (req, res) => {
    try {
      const result = await AuthService.refreshToken(req.body.refreshToken);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Token refresh error:', error);
      res.status(401).json({
        success: false,
        error: 'Token refresh failed'
      });
    }
  }
);

// === PASSWORD MANAGEMENT ROUTES ===

/**
 * POST /auth/password-reset/request - Request password reset
 */
router.post('/password-reset/request',
  validateRequest(passwordResetRequestSchema),
  async (req, res) => {
    try {
      await AuthService.requestPasswordReset(req.body.email, req.body.organizationId);
      
      res.json({
        success: true,
        message: 'Password reset email sent if account exists'
      });
    } catch (error) {
      logger.error('Password reset request error:', error);
      res.status(500).json({
        success: false,
        error: 'Password reset request failed'
      });
    }
  }
);

/**
 * POST /auth/password-reset/confirm - Reset password with token
 */
router.post('/password-reset/confirm',
  validateRequest(passwordResetSchema),
  auditLog('password_reset', 'authentication'),
  async (req, res) => {
    try {
      await AuthService.resetPassword(req.body.token, req.body.newPassword);
      
      res.json({
        success: true,
        message: 'Password reset successfully'
      });
    } catch (error) {
      logger.error('Password reset error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Password reset failed'
      });
    }
  }
);

/**
 * POST /auth/change-password - Change password (authenticated)
 */
router.post('/change-password',
  authenticate,
  validateRequest(changePasswordSchema),
  auditLog('password_change', 'authentication'),
  async (req, res) => {
    try {
      await AuthService.changePassword(
        req.user!.id,
        req.body.currentPassword,
        req.body.newPassword
      );
      
      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      logger.error('Password change error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Password change failed'
      });
    }
  }
);

// === EMAIL VERIFICATION ROUTES ===

/**
 * GET /auth/verify-email/:token - Verify email address
 */
router.get('/verify-email/:token',
  auditLog('email_verification', 'authentication'),
  async (req, res) => {
    try {
      await AuthService.verifyEmail(req.params.token);
      
      res.json({
        success: true,
        message: 'Email verified successfully'
      });
    } catch (error) {
      logger.error('Email verification error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Email verification failed'
      });
    }
  }
);

// === USER INFO ROUTES ===

/**
 * GET /auth/me - Get current user info
 */
router.get('/me',
  authenticate,
  async (req, res) => {
    try {
      const user = await UserManagementService.getUserById(req.user!.id);
      
      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      logger.error('Get user info error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user info'
      });
    }
  }
);

/**
 * GET /auth/sessions - Get user sessions
 */
router.get('/sessions',
  authenticate,
  async (req, res) => {
    try {
      const user = await UserManagementService.getUserById(req.user!.id);
      
      res.json({
        success: true,
        data: {
          sessions: user.activeSessions
        }
      });
    } catch (error) {
      logger.error('Get sessions error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get sessions'
      });
    }
  }
);

// === OAUTH2 ROUTES ===

/**
 * GET /auth/providers - Get available OAuth2 providers
 */
router.get('/providers', async (req, res) => {
  try {
    const providers = OAuth2Service.getAvailableProviders();
    
    res.json({
      success: true,
      data: providers
    });
  } catch (error) {
    logger.error('Providers error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get providers'
    });
  }
});

/**
 * GET /auth/google - Initiate Google OAuth2
 */
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

/**
 * GET /auth/google/callback - Google OAuth2 callback
 */
router.get('/google/callback',
  passport.authenticate('google', { session: false }),
  async (req: any, res) => {
    try {
      const tokens = await OAuth2Service.generateOAuth2Tokens(req.user, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      // Redirect to frontend with tokens (in production, use secure cookies)
      const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?token=${tokens.accessToken}&refresh=${tokens.refreshToken}`;
      res.redirect(redirectUrl);
    } catch (error) {
      logger.error('Google OAuth2 callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
    }
  }
);

/**
 * GET /auth/microsoft - Initiate Microsoft OAuth2
 */
router.get('/microsoft',
  passport.authenticate('microsoft', { scope: ['user.read'] })
);

/**
 * GET /auth/microsoft/callback - Microsoft OAuth2 callback
 */
router.get('/microsoft/callback',
  passport.authenticate('microsoft', { session: false }),
  async (req: any, res) => {
    try {
      const tokens = await OAuth2Service.generateOAuth2Tokens(req.user, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?token=${tokens.accessToken}&refresh=${tokens.refreshToken}`;
      res.redirect(redirectUrl);
    } catch (error) {
      logger.error('Microsoft OAuth2 callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
    }
  }
);

/**
 * GET /auth/github - Initiate GitHub OAuth2
 */
router.get('/github',
  passport.authenticate('github', { scope: ['user:email'] })
);

/**
 * GET /auth/github/callback - GitHub OAuth2 callback
 */
router.get('/github/callback',
  passport.authenticate('github', { session: false }),
  async (req: any, res) => {
    try {
      const tokens = await OAuth2Service.generateOAuth2Tokens(req.user, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?token=${tokens.accessToken}&refresh=${tokens.refreshToken}`;
      res.redirect(redirectUrl);
    } catch (error) {
      logger.error('GitHub OAuth2 callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
    }
  }
);

// === SAML ROUTES ===

/**
 * GET /auth/saml/:organizationId - Initiate SAML SSO
 */
router.get('/saml/:organizationId',
  async (req, res, next) => {
    const { organizationId } = req.params;
    const strategyName = `saml-${organizationId}`;
    
    passport.authenticate(strategyName, {
      successRedirect: `${process.env.FRONTEND_URL}/dashboard`,
      failureRedirect: `${process.env.FRONTEND_URL}/login?error=saml_failed`
    })(req, res, next);
  }
);

/**
 * POST /auth/saml/:organizationId/callback - SAML assertion callback
 */
router.post('/saml/:organizationId/callback',
  async (req, res, next) => {
    const { organizationId } = req.params;
    const strategyName = `saml-${organizationId}`;
    
    passport.authenticate(strategyName, { session: false }, async (err: any, user: any) => {
      if (err) {
        logger.error('SAML authentication error:', err);
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=saml_failed`);
      }
      
      if (!user) {
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=saml_failed`);
      }
      
      try {
        const tokens = await SAMLService.generateSAMLTokens(user, {
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
        
        const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?token=${tokens.accessToken}&refresh=${tokens.refreshToken}`;
        res.redirect(redirectUrl);
      } catch (error) {
        logger.error('SAML token generation error:', error);
        res.redirect(`${process.env.FRONTEND_URL}/login?error=saml_failed`);
      }
    })(req, res, next);
  }
);

/**
 * GET /auth/saml/:organizationId/metadata - SAML SP metadata
 */
router.get('/saml/:organizationId/metadata',
  async (req, res) => {
    try {
      const metadata = await SAMLService.getSAMLMetadata(req.params.organizationId);
      
      res.set('Content-Type', 'application/xml');
      res.send(metadata);
    } catch (error) {
      logger.error('SAML metadata error:', error);
      res.status(404).json({
        success: false,
        error: 'SAML metadata not found'
      });
    }
  }
);

/**
 * GET /auth/saml/:organizationId/logout - SAML logout
 */
router.get('/saml/:organizationId/logout',
  authenticate,
  async (req, res) => {
    try {
      const logoutUrl = await SAMLService.initiateSAMLLogout(req.user!.id);
      
      if (logoutUrl) {
        res.redirect(logoutUrl);
      } else {
        res.redirect(`${process.env.FRONTEND_URL}/login`);
      }
    } catch (error) {
      logger.error('SAML logout error:', error);
      res.redirect(`${process.env.FRONTEND_URL}/login`);
    }
  }
);

export default router;