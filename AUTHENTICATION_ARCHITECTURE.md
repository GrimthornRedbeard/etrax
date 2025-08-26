# 🔐 ETrax Authentication Architecture

## 📋 Overview

Comprehensive authentication system supporting:
- **Local Authentication** - Username/password with secure hashing
- **OAuth2 Providers** - Google, Microsoft, GitHub, custom providers
- **SAML SSO** - Enterprise identity provider integration
- **Multi-tenant Support** - School/organization isolation
- **Role-based Access Control** - Granular permission system

## 🏗️ Architecture Components

### 1. Authentication Service Layer
```
┌─────────────────────────────────────────────────────────────┐
│                 Authentication Gateway                      │
├─────────────────────────────────────────────────────────────┤
│  Local Auth  │  OAuth2 Auth  │  SAML Auth  │  API Auth     │
│  (bcrypt)    │  (Passport)   │  (SAML2)    │  (JWT/API Keys)│
├─────────────────────────────────────────────────────────────┤
│                 JWT Token Management                        │
│            (Access + Refresh + ID Tokens)                  │
├─────────────────────────────────────────────────────────────┤
│              Session & User Management                      │
│         (Multi-tenant + RBAC + Permissions)                │
└─────────────────────────────────────────────────────────────┘
```

### 2. Database Schema
```sql
-- Organizations (Multi-tenant support)
organizations {
  id: uuid
  name: string
  domain: string
  settings: jsonb
  saml_config: jsonb
  oauth_config: jsonb
}

-- Users with multi-auth support
users {
  id: uuid
  organization_id: uuid
  email: string
  password_hash: string (nullable for SSO-only)
  first_name: string
  last_name: string
  role: enum
  is_active: boolean
  auth_provider: enum
  external_id: string (nullable)
}

-- Authentication sessions
user_sessions {
  id: uuid
  user_id: uuid
  refresh_token_hash: string
  device_info: jsonb
  expires_at: timestamp
}
```

### 3. OAuth2 Providers Configuration
- **Google** - Google Workspace integration
- **Microsoft** - Azure AD/Office 365 integration
- **GitHub** - Developer/IT team access
- **Custom** - Configurable OAuth2 endpoints

### 4. SAML SSO Features
- **Identity Provider Integration** - Active Directory, Okta, Auth0
- **Attribute Mapping** - Flexible user attribute configuration
- **Just-in-Time Provisioning** - Auto-create users on first login
- **Multi-tenant SAML** - Per-organization SAML configuration

## 🚀 Implementation Plan

### Phase 1: JWT Foundation
- Secure JWT token generation (RS256)
- Access & refresh token rotation
- Token validation middleware
- Session management

### Phase 2: Local Authentication
- Password hashing with bcrypt (cost: 12)
- Email verification system
- Password reset functionality
- Account lockout protection

### Phase 3: OAuth2 Integration
- Passport.js OAuth2 strategies
- Provider-specific user mapping
- Account linking/unlinking
- Social login UI components

### Phase 4: SAML SSO
- SAML2 service provider implementation
- IdP metadata configuration
- Attribute assertion handling
- SSO initiation endpoints

### Phase 5: Multi-tenant Support
- Organization-based user isolation
- Per-tenant authentication policies
- Custom branding support
- Domain-based organization routing

## 🔒 Security Features

### Token Security
- **Asymmetric JWT signing** (RS256 with rotating keys)
- **Short-lived access tokens** (15 minutes)
- **Secure refresh tokens** (7 days, single-use)
- **Token revocation** support

### Password Security
- **bcrypt hashing** (cost factor 12+)
- **Password complexity requirements**
- **Breach detection** (HaveIBeenPwned integration)
- **Password history** (prevent reuse)

### Session Security
- **Device fingerprinting**
- **IP address validation**
- **Concurrent session limits**
- **Suspicious activity detection**

### API Security
- **Rate limiting** (by user/IP/endpoint)
- **CORS configuration**
- **Security headers** (HSTS, CSP, etc.)
- **API key authentication** for service accounts

## 📊 Authentication Flow Diagrams

### OAuth2 Flow
```
User → Frontend → Backend → OAuth Provider → Backend → Frontend → User
  1. Click "Login with Google"
  2. Redirect to Google OAuth
  3. User grants permission
  4. Callback with auth code
  5. Exchange code for tokens
  6. Create/update user record
  7. Generate ETrax JWT tokens
  8. Return tokens to frontend
```

### SAML Flow
```
User → Frontend → Backend → SAML IdP → Backend → Frontend → User
  1. Access protected resource
  2. Redirect to SAML SSO
  3. User authenticates with IdP
  4. SAML assertion POST
  5. Validate & parse assertion
  6. Create/update user record
  7. Generate ETrax JWT tokens
  8. Return tokens to frontend
```

## 🛠️ Technology Stack

### Backend Dependencies
```json
{
  "passport": "^0.7.0",
  "passport-google-oauth20": "^2.0.0",
  "passport-microsoft": "^1.0.0",
  "passport-github2": "^0.1.12",
  "passport-saml": "^3.2.4",
  "jsonwebtoken": "^9.0.2",
  "bcryptjs": "^2.4.3",
  "node-cache": "^5.1.2",
  "express-rate-limit": "^7.4.1",
  "@types/passport": "^1.0.16"
}
```

### Environment Configuration
```env
# JWT Configuration
JWT_PRIVATE_KEY_PATH=/etc/etrax/jwt-private.pem
JWT_PUBLIC_KEY_PATH=/etc/etrax/jwt-public.pem
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# OAuth2 Configuration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# SAML Configuration
SAML_CERT_PATH=/etc/etrax/saml-cert.pem
SAML_KEY_PATH=/etc/etrax/saml-key.pem
SAML_ISSUER=https://etrax.app/saml
SAML_CALLBACK_URL=https://etrax.app/auth/saml/callback

# Security Configuration
BCRYPT_ROUNDS=12
SESSION_SECRET=your_session_secret
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 📱 Frontend Integration

### Authentication Context
```typescript
interface AuthContext {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithProvider: (provider: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
}
```

### Multi-factor Authentication UI
- **TOTP Support** - Time-based OTP with QR codes
- **SMS Backup** - Optional SMS verification
- **Recovery Codes** - One-time backup codes
- **Device Trust** - Remember trusted devices

## 🏢 Enterprise Features

### Single Sign-On (SSO)
- **Domain-based routing** - Auto-redirect based on email domain
- **IdP-initiated SSO** - Support for IdP-initiated flows
- **Logout propagation** - Single logout across systems
- **Session timeout** - Configurable session policies

### User Provisioning
- **SCIM Protocol** - Automated user lifecycle management
- **Directory Sync** - Regular user/group synchronization
- **Custom Attributes** - Flexible user metadata support
- **Bulk Operations** - Import/export user data

### Compliance & Auditing
- **Authentication logs** - Detailed login/logout tracking
- **Failed attempt monitoring** - Brute force detection
- **Compliance reporting** - SOC2, GDPR, HIPAA support
- **Data retention** - Configurable log retention policies

This architecture provides a robust, scalable, and secure authentication system suitable for educational institutions and enterprise environments.