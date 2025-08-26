#!/bin/bash

# ETrax OAuth2 Provider Setup Script
# This script helps configure OAuth2 providers for authentication

set -e

echo "🔐 ETrax OAuth2 Provider Setup"
echo "============================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_warning ".env file not found. Creating from .env.example..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        print_status ".env file created from template"
    else
        print_error ".env.example not found. Please create .env file manually."
        exit 1
    fi
fi

echo ""
print_step "1. Google OAuth2 Setup"
echo "======================="
echo ""
echo "To setup Google OAuth2:"
echo "1. Go to https://console.cloud.google.com/"
echo "2. Create a new project or select existing one"
echo "3. Enable Google+ API and/or Google OAuth2 API"
echo "4. Go to 'Credentials' → 'Create Credentials' → 'OAuth 2.0 Client IDs'"
echo "5. Choose 'Web application'"
echo "6. Add authorized redirect URIs:"
echo "   - http://localhost:8080/api/auth/google/callback (development)"
echo "   - https://your-domain.com/api/auth/google/callback (production)"
echo "7. Copy Client ID and Client Secret"
echo ""

read -p "Do you want to configure Google OAuth2? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -p "Enter Google Client ID: " google_client_id
    read -p "Enter Google Client Secret: " google_client_secret
    
    # Update .env file
    if grep -q "GOOGLE_CLIENT_ID=" .env; then
        sed -i "s/GOOGLE_CLIENT_ID=.*/GOOGLE_CLIENT_ID=$google_client_id/" .env
        sed -i "s/GOOGLE_CLIENT_SECRET=.*/GOOGLE_CLIENT_SECRET=$google_client_secret/" .env
    else
        echo "GOOGLE_CLIENT_ID=$google_client_id" >> .env
        echo "GOOGLE_CLIENT_SECRET=$google_client_secret" >> .env
    fi
    
    print_status "Google OAuth2 configured successfully!"
fi

echo ""
print_step "2. Microsoft OAuth2 Setup"
echo "=========================="
echo ""
echo "To setup Microsoft OAuth2:"
echo "1. Go to https://portal.azure.com/"
echo "2. Go to 'Azure Active Directory' → 'App registrations'"
echo "3. Click 'New registration'"
echo "4. Enter app name and select supported account types"
echo "5. Add redirect URI (Web):"
echo "   - http://localhost:8080/api/auth/microsoft/callback (development)"
echo "   - https://your-domain.com/api/auth/microsoft/callback (production)"
echo "6. After creation, go to 'Certificates & secrets' → 'New client secret'"
echo "7. Copy Application (client) ID and Client Secret"
echo "8. Go to 'API permissions' → 'Add permission' → 'Microsoft Graph' → 'User.Read'"
echo ""

read -p "Do you want to configure Microsoft OAuth2? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -p "Enter Microsoft Client ID: " microsoft_client_id
    read -p "Enter Microsoft Client Secret: " microsoft_client_secret
    
    # Update .env file
    if grep -q "MICROSOFT_CLIENT_ID=" .env; then
        sed -i "s/MICROSOFT_CLIENT_ID=.*/MICROSOFT_CLIENT_ID=$microsoft_client_id/" .env
        sed -i "s/MICROSOFT_CLIENT_SECRET=.*/MICROSOFT_CLIENT_SECRET=$microsoft_client_secret/" .env
    else
        echo "MICROSOFT_CLIENT_ID=$microsoft_client_id" >> .env
        echo "MICROSOFT_CLIENT_SECRET=$microsoft_client_secret" >> .env
    fi
    
    print_status "Microsoft OAuth2 configured successfully!"
fi

echo ""
print_step "3. GitHub OAuth2 Setup"
echo "======================"
echo ""
echo "To setup GitHub OAuth2:"
echo "1. Go to https://github.com/settings/developers"
echo "2. Click 'OAuth Apps' → 'New OAuth App'"
echo "3. Fill in application details:"
echo "   - Application name: ETrax"
echo "   - Homepage URL: https://your-domain.com"
echo "   - Authorization callback URL:"
echo "     * http://localhost:8080/api/auth/github/callback (development)"
echo "     * https://your-domain.com/api/auth/github/callback (production)"
echo "4. Copy Client ID and Client Secret"
echo ""

read -p "Do you want to configure GitHub OAuth2? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -p "Enter GitHub Client ID: " github_client_id
    read -p "Enter GitHub Client Secret: " github_client_secret
    
    # Update .env file
    if grep -q "GITHUB_CLIENT_ID=" .env; then
        sed -i "s/GITHUB_CLIENT_ID=.*/GITHUB_CLIENT_ID=$github_client_id/" .env
        sed -i "s/GITHUB_CLIENT_SECRET=.*/GITHUB_CLIENT_SECRET=$github_client_secret/" .env
    else
        echo "GITHUB_CLIENT_ID=$github_client_id" >> .env
        echo "GITHUB_CLIENT_SECRET=$github_client_secret" >> .env
    fi
    
    print_status "GitHub OAuth2 configured successfully!"
fi

echo ""
print_step "4. JWT Secrets Setup"
echo "===================="
echo ""
echo "Generating secure JWT secrets..."

# Generate JWT secrets
jwt_secret=$(openssl rand -base64 64 | tr -d '\n')
jwt_refresh_secret=$(openssl rand -base64 64 | tr -d '\n')
session_secret=$(openssl rand -base64 32 | tr -d '\n')

# Update .env file
if grep -q "JWT_SECRET=" .env; then
    sed -i "s/JWT_SECRET=.*/JWT_SECRET=$jwt_secret/" .env
    sed -i "s/JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$jwt_refresh_secret/" .env
    sed -i "s/SESSION_SECRET=.*/SESSION_SECRET=$session_secret/" .env
else
    echo "JWT_SECRET=$jwt_secret" >> .env
    echo "JWT_REFRESH_SECRET=$jwt_refresh_secret" >> .env
    echo "SESSION_SECRET=$session_secret" >> .env
fi

print_status "JWT secrets generated successfully!"

echo ""
print_step "5. Frontend URL Configuration"
echo "============================="
echo ""
read -p "Enter your frontend URL (default: http://localhost:3000): " frontend_url
frontend_url=${frontend_url:-http://localhost:3000}

# Update .env file
if grep -q "FRONTEND_URL=" .env; then
    sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=$frontend_url|" .env
else
    echo "FRONTEND_URL=$frontend_url" >> .env
fi

print_status "Frontend URL configured: $frontend_url"

echo ""
print_step "6. Verification"
echo "==============="
echo ""
print_status "Configuration complete! Here's your setup:"
echo ""

# Show configured providers
echo "Configured OAuth2 Providers:"
if grep -q "GOOGLE_CLIENT_ID=.*[^=]$" .env; then
    echo "  ✅ Google OAuth2"
else
    echo "  ❌ Google OAuth2"
fi

if grep -q "MICROSOFT_CLIENT_ID=.*[^=]$" .env; then
    echo "  ✅ Microsoft OAuth2"
else
    echo "  ❌ Microsoft OAuth2"
fi

if grep -q "GITHUB_CLIENT_ID=.*[^=]$" .env; then
    echo "  ✅ GitHub OAuth2"
else
    echo "  ❌ GitHub OAuth2"
fi

echo ""
echo "JWT Configuration:"
echo "  ✅ JWT Secret generated"
echo "  ✅ Refresh Secret generated"
echo "  ✅ Session Secret generated"

echo ""
echo "Frontend Configuration:"
echo "  ✅ Frontend URL: $frontend_url"

echo ""
print_step "Next Steps"
echo "=========="
echo ""
echo "1. Review your .env file configuration"
echo "2. Run database migrations: npm run db:migrate"
echo "3. Start the server: npm run dev"
echo "4. Test OAuth2 providers at: $frontend_url/login"
echo ""

print_warning "Security Notes:"
echo "• Never commit your .env file to version control"
echo "• Use different secrets for production"
echo "• Enable HTTPS in production"
echo "• Regularly rotate OAuth2 secrets"

echo ""
print_status "Setup complete! 🎉"