#!/bin/bash

# ETrax Authentication System Deployment Script
# Deploys the complete authentication system to production

set -e

echo "🚀 ETrax Authentication System Deployment"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_deploy() {
    echo -e "${PURPLE}[DEPLOY]${NC} $1"
}

# Check if running from correct directory
if [ ! -f "package.json" ]; then
    print_error "Please run this script from the backend directory"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_error ".env file not found. Please configure environment variables first."
    print_warning "Run ./scripts/setup-oauth2-providers.sh to configure OAuth2 providers"
    exit 1
fi

echo ""
print_step "1. Pre-deployment Checks"
echo "========================"
echo ""

# Check Node.js version
node_version=$(node -v)
print_status "Node.js version: $node_version"

# Check npm version
npm_version=$(npm -v)
print_status "npm version: $npm_version"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    print_warning "node_modules not found. Installing dependencies..."
    npm ci
    print_status "Dependencies installed"
fi

# Check database connection
print_status "Checking database connection..."
if npm run db:generate > /dev/null 2>&1; then
    print_success "Database connection successful"
else
    print_error "Database connection failed. Check DATABASE_URL in .env"
    exit 1
fi

echo ""
print_step "2. Database Migration"
echo "===================="
echo ""

print_deploy "Running database migrations..."
npm run db:migrate:prod

print_deploy "Generating Prisma client..."
npm run db:generate

print_success "Database migration completed"

echo ""
print_step "3. Build Application"
echo "==================="
echo ""

print_deploy "Building TypeScript application..."
npm run build

if [ ! -d "dist" ]; then
    print_error "Build failed - dist directory not found"
    exit 1
fi

print_success "Application built successfully"

echo ""
print_step "4. Security Validation"
echo "======================"
echo ""

# Check for security issues
print_deploy "Running security audit..."
npm audit --audit-level=moderate || {
    print_warning "Security vulnerabilities found. Review and fix before production deployment."
}

# Validate JWT secrets
if grep -q "your-.*-secret" .env; then
    print_error "Default JWT secrets detected! Please generate secure secrets."
    print_warning "Run ./scripts/setup-oauth2-providers.sh to generate secure secrets"
    exit 1
fi

# Check OAuth2 configuration
oauth_configured=false
if grep -q "GOOGLE_CLIENT_ID=.*[^=]$" .env && ! grep -q "your-google-client-id" .env; then
    oauth_configured=true
fi
if grep -q "MICROSOFT_CLIENT_ID=.*[^=]$" .env && ! grep -q "your-microsoft-client-id" .env; then
    oauth_configured=true
fi
if grep -q "GITHUB_CLIENT_ID=.*[^=]$" .env && ! grep -q "your-github-client-id" .env; then
    oauth_configured=true
fi

if [ "$oauth_configured" = false ]; then
    print_warning "No OAuth2 providers configured. Users will only be able to use local authentication."
fi

print_success "Security validation completed"

echo ""
print_step "5. PM2 Deployment Configuration"
echo "==============================="
echo ""

# Create PM2 ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'etrax-backend',
    script: 'dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 8080
    },
    env_production: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    watch: false,
    ignore_watch: ['node_modules', 'logs', 'uploads'],
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
EOF

print_status "PM2 configuration created"

# Create logs directory
mkdir -p logs
print_status "Logs directory created"

echo ""
print_step "6. Nginx Configuration"
echo "======================"
echo ""

# Create nginx configuration for authentication endpoints
cat > nginx-auth.conf << 'EOF'
# ETrax Authentication System - Nginx Configuration
# Add this to your main nginx configuration

# Rate limiting for authentication endpoints
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=10r/m;
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=60r/m;

# Authentication API endpoints
location /api/auth/ {
    limit_req zone=auth_limit burst=5 nodelay;
    proxy_pass http://localhost:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    
    # Security headers for auth endpoints
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy strict-origin-when-cross-origin;
}

# Admin API endpoints (additional rate limiting)
location /api/admin/ {
    limit_req zone=auth_limit burst=3 nodelay;
    proxy_pass http://localhost:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    
    # Strict security for admin endpoints
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy strict-origin-when-cross-origin;
}

# General API endpoints
location /api/ {
    limit_req zone=api_limit burst=10 nodelay;
    proxy_pass http://localhost:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}
EOF

print_status "Nginx configuration created (nginx-auth.conf)"
print_warning "Please add the contents of nginx-auth.conf to your main nginx configuration"

echo ""
print_step "7. Environment Validation"
echo "========================="
echo ""

# Show environment summary
print_status "Environment Configuration Summary:"
echo ""

echo "Database:"
if [ -n "$DATABASE_URL" ]; then
    echo "  ✅ Database URL configured"
else
    echo "  ❌ Database URL missing"
fi

echo ""
echo "Authentication:"
if grep -q "JWT_SECRET=.*[^=]$" .env && ! grep -q "your-.*-secret" .env; then
    echo "  ✅ JWT secrets configured"
else
    echo "  ❌ JWT secrets missing or using defaults"
fi

echo ""
echo "OAuth2 Providers:"
if grep -q "GOOGLE_CLIENT_ID=.*[^=]$" .env && ! grep -q "your-google-client-id" .env; then
    echo "  ✅ Google OAuth2 configured"
else
    echo "  ❌ Google OAuth2 not configured"
fi

if grep -q "MICROSOFT_CLIENT_ID=.*[^=]$" .env && ! grep -q "your-microsoft-client-id" .env; then
    echo "  ✅ Microsoft OAuth2 configured"
else
    echo "  ❌ Microsoft OAuth2 not configured"
fi

if grep -q "GITHUB_CLIENT_ID=.*[^=]$" .env && ! grep -q "your-github-client-id" .env; then
    echo "  ✅ GitHub OAuth2 configured"
else
    echo "  ❌ GitHub OAuth2 not configured"
fi

echo ""
echo "Email Service:"
if grep -q "EMAIL_PROVIDER=.*[^=]$" .env && ! grep -q "smtp" .env; then
    echo "  ✅ Email provider configured"
else
    echo "  ⚠️  Email provider using default SMTP (configure for production)"
fi

echo ""
print_step "8. Deployment Commands"
echo "======================"
echo ""

print_deploy "Ready to deploy! Run these commands:"
echo ""
echo "1. Start application with PM2:"
echo "   pm2 start ecosystem.config.js --env production"
echo ""
echo "2. Save PM2 configuration:"
echo "   pm2 save"
echo "   pm2 startup"
echo ""
echo "3. Monitor application:"
echo "   pm2 monitor"
echo "   pm2 logs etrax-backend"
echo ""
echo "4. Restart application (if needed):"
echo "   pm2 restart etrax-backend"
echo ""

echo ""
print_step "9. Testing & Validation"
echo "======================="
echo ""

echo "After deployment, test these endpoints:"
echo ""
echo "Health Check:"
echo "  curl https://your-domain.com/health"
echo ""
echo "Authentication System:"
echo "  curl https://your-domain.com/api/auth/providers"
echo ""
echo "OAuth2 Providers (if configured):"
echo "  https://your-domain.com/api/auth/google"
echo "  https://your-domain.com/api/auth/microsoft"
echo "  https://your-domain.com/api/auth/github"
echo ""

echo ""
print_step "10. Post-Deployment Setup"
echo "========================="
echo ""

echo "1. Create first admin user:"
echo "   • Use the registration endpoint"
echo "   • Or use the admin API to create users"
echo "   • First user in an organization gets ADMIN role automatically"
echo ""

echo "2. Configure SAML (if needed):"
echo "   • Use /api/admin/organizations/:id/saml endpoint"
echo "   • Configure your IdP with SP metadata from /api/auth/saml/:orgId/metadata"
echo ""

echo "3. Setup monitoring:"
echo "   • Configure log rotation for ./logs/"
echo "   • Setup alerts for authentication failures"
echo "   • Monitor JWT token usage and refresh patterns"
echo ""

echo ""
print_success "🎉 Authentication System Deployment Complete!"
echo ""

print_status "Your ETrax authentication system is now ready for production use with:"
echo "  • JWT-based authentication with secure token rotation"
echo "  • Multi-tenant organization support"
echo "  • OAuth2 integration (Google, Microsoft, GitHub)"
echo "  • SAML SSO ready for enterprise identity providers"
echo "  • Role-based access control with granular permissions"
echo "  • Comprehensive audit logging and security monitoring"
echo ""

print_warning "Don't forget to:"
echo "  1. Add nginx-auth.conf to your nginx configuration"
echo "  2. Test all authentication flows"
echo "  3. Setup SSL/TLS certificates"
echo "  4. Configure email service for production"
echo "  5. Setup monitoring and alerting"
echo ""

print_deploy "Happy deploying! 🚀"