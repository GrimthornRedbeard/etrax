-- Create authentication-related tables and modify existing ones
-- This migration adds comprehensive authentication support to ETrax

-- User Sessions (for JWT refresh tokens)
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL,
  device_info JSONB DEFAULT '{}',
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, session_id)
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Password Reset Tokens
CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

-- Email Verification Tokens
CREATE TABLE email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_email_verification_tokens_token ON email_verification_tokens(token);
CREATE INDEX idx_email_verification_tokens_expires_at ON email_verification_tokens(expires_at);

-- User Invitations
CREATE TABLE user_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES users(id),
  accepted_at TIMESTAMP NULL,
  expires_at TIMESTAMP NOT NULL,
  resent_at TIMESTAMP NULL,
  resent_by UUID NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_invites_token ON user_invites(token);
CREATE INDEX idx_user_invites_email ON user_invites(email);
CREATE INDEX idx_user_invites_organization_id ON user_invites(organization_id);

-- Audit Logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Update Users Table for Authentication
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'LOCAL';
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS saml_name_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS saml_session_index TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS saml_attributes JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by UUID NULL REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

-- Create indexes for new user columns
CREATE INDEX idx_users_auth_provider ON users(auth_provider);
CREATE INDEX idx_users_external_id ON users(external_id);
CREATE INDEX idx_users_saml_name_id ON users(saml_name_id);
CREATE INDEX idx_users_email_verified ON users(email_verified);
CREATE INDEX idx_users_last_login_at ON users(last_login_at);

-- Update Organizations Table for Multi-Tenant Support
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS saml_config JSONB;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS oauth_config JSONB;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS allowed_domains TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'basic';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 50;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS features TEXT[] DEFAULT ARRAY['equipment_management', 'qr_codes'];
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS branding JSONB DEFAULT '{}';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP NULL;

-- Create indexes for organization columns
CREATE INDEX idx_organizations_domain ON organizations(domain);
CREATE INDEX idx_organizations_subscription_plan ON organizations(subscription_plan);
CREATE INDEX idx_organizations_is_active ON organizations(is_active);

-- Create GIN index for allowed_domains array
CREATE INDEX idx_organizations_allowed_domains ON organizations USING GIN(allowed_domains);

-- Create GIN indexes for JSONB columns
CREATE INDEX idx_organizations_saml_config ON organizations USING GIN(saml_config);
CREATE INDEX idx_organizations_features ON organizations USING GIN(features);
CREATE INDEX idx_users_saml_attributes ON users USING GIN(saml_attributes);

-- Add constraints for authentication
ALTER TABLE users ADD CONSTRAINT chk_auth_provider CHECK (auth_provider IN ('LOCAL', 'GOOGLE', 'MICROSOFT', 'GITHUB', 'SAML'));
ALTER TABLE users ADD CONSTRAINT chk_email_verified CHECK (email_verified IS NOT NULL);
ALTER TABLE users ADD CONSTRAINT chk_login_attempts CHECK (login_attempts >= 0);

ALTER TABLE organizations ADD CONSTRAINT chk_subscription_plan CHECK (subscription_plan IN ('free', 'basic', 'professional', 'enterprise'));
ALTER TABLE organizations ADD CONSTRAINT chk_max_users CHECK (max_users >= -1); -- -1 means unlimited

ALTER TABLE user_invites ADD CONSTRAINT chk_role CHECK (role IN ('VIEWER', 'USER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'));

-- Add unique constraints
ALTER TABLE users ADD CONSTRAINT unq_users_email_organization UNIQUE (email, organization_id);
ALTER TABLE users ADD CONSTRAINT unq_users_external_id_provider UNIQUE (external_id, auth_provider);

-- Create function to clean up expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_tokens() RETURNS void AS $$
BEGIN
  DELETE FROM password_reset_tokens WHERE expires_at < NOW();
  DELETE FROM email_verification_tokens WHERE expires_at < NOW();
  DELETE FROM user_invites WHERE expires_at < NOW() AND accepted_at IS NULL;
  DELETE FROM user_sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to run cleanup (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-expired-tokens', '0 2 * * *', 'SELECT cleanup_expired_tokens();');

-- Insert default organization for existing users (if any)
DO $$
DECLARE
  default_org_id UUID;
BEGIN
  -- Check if we have users without organization_id
  IF EXISTS (SELECT 1 FROM users WHERE organization_id IS NULL) THEN
    -- Create default organization
    INSERT INTO organizations (name, domain, subscription_plan, max_users, features, is_active)
    VALUES ('Default Organization', 'localhost', 'professional', -1, ARRAY['equipment_management', 'qr_codes', 'basic_reporting', 'voice_commands'], true)
    RETURNING id INTO default_org_id;
    
    -- Update users without organization
    UPDATE users 
    SET organization_id = default_org_id,
        email_verified = true,
        auth_provider = 'LOCAL'
    WHERE organization_id IS NULL;
  END IF;
END $$;

-- Create triggers for audit logging
CREATE OR REPLACE FUNCTION audit_user_changes() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (action, resource, resource_id, metadata)
    VALUES ('user_created', 'user', NEW.id::text, row_to_json(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (user_id, action, resource, resource_id, metadata)
    VALUES (NEW.id, 'user_updated', 'user', NEW.id::text, 
            json_build_object('old', row_to_json(OLD), 'new', row_to_json(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (user_id, action, resource, resource_id, metadata)
    VALUES (OLD.id, 'user_deleted', 'user', OLD.id::text, row_to_json(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_audit_user_changes
  AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION audit_user_changes();

-- Create function to update last_login_at
CREATE OR REPLACE FUNCTION update_last_login() RETURNS TRIGGER AS $$
BEGIN
  UPDATE users SET last_login_at = NOW() WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_last_login
  AFTER INSERT ON user_sessions
  FOR EACH ROW EXECUTE FUNCTION update_last_login();

-- Add comments for documentation
COMMENT ON TABLE user_sessions IS 'JWT refresh token storage and session management';
COMMENT ON TABLE password_reset_tokens IS 'Password reset tokens with expiration';
COMMENT ON TABLE email_verification_tokens IS 'Email verification tokens';
COMMENT ON TABLE user_invites IS 'User invitation system with role assignment';
COMMENT ON TABLE audit_logs IS 'Authentication and security event logging';

COMMENT ON COLUMN users.auth_provider IS 'Authentication provider: LOCAL, GOOGLE, MICROSOFT, GITHUB, SAML';
COMMENT ON COLUMN users.external_id IS 'External provider user ID';
COMMENT ON COLUMN users.saml_name_id IS 'SAML NameID for SSO';
COMMENT ON COLUMN users.login_attempts IS 'Failed login attempt counter';
COMMENT ON COLUMN users.locked_until IS 'Account lockout expiration timestamp';
COMMENT ON COLUMN users.email_verified IS 'Email address verification status';

COMMENT ON COLUMN organizations.saml_config IS 'SAML SSO configuration JSON';
COMMENT ON COLUMN organizations.subscription_plan IS 'Subscription plan: free, basic, professional, enterprise';
COMMENT ON COLUMN organizations.max_users IS 'Maximum users allowed (-1 = unlimited)';
COMMENT ON COLUMN organizations.features IS 'Enabled features array';
COMMENT ON COLUMN organizations.allowed_domains IS 'Allowed email domains for auto-assignment';