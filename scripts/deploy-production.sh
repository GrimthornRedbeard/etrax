#!/bin/bash

# ETrax Production Deployment Script
# Run this script on the production server at 74.208.111.202

set -e  # Exit on any error

echo "🚀 Starting ETrax production deployment..."

# Configuration
DEPLOY_DIR="/var/www/etrax"
REPO_URL="https://github.com/GrimthornRedbeard/etrax.git"
APP_NAME="etrax-backend"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "Don't run this script as root! Use a regular user account."
   exit 1
fi

# Step 1: Check prerequisites
print_status "Checking prerequisites..."

# Check Node.js version
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js version must be 18 or higher. Current version: $(node --version)"
    exit 1
fi

# Check PostgreSQL
if ! command -v psql &> /dev/null; then
    print_error "PostgreSQL is not installed. Please install PostgreSQL first."
    exit 1
fi

# Check port availability
if netstat -tlnp 2>/dev/null | grep -q ":8080 "; then
    print_warning "Port 8080 is already in use. Please stop the service or change the port."
    netstat -tlnp | grep ":8080 "
    read -p "Continue anyway? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Step 2: Setup deployment directory
print_status "Setting up deployment directory..."

if [ ! -d "$DEPLOY_DIR" ]; then
    sudo mkdir -p "$DEPLOY_DIR"
    sudo chown $USER:$USER "$DEPLOY_DIR"
fi

cd "$DEPLOY_DIR"

# Step 3: Clone or update repository
if [ -d ".git" ]; then
    print_status "Updating existing repository..."
    git pull origin main
else
    print_status "Cloning repository..."
    git clone "$REPO_URL" .
fi

# Step 4: Install backend dependencies
print_status "Installing backend dependencies..."
cd backend
npm install --production

# Build backend
print_status "Building backend..."
npm run build

# Step 5: Install frontend dependencies and build
print_status "Installing frontend dependencies..."
cd ../frontend
npm install

print_status "Building frontend..."
npm run build

cd ..

# Step 6: Setup environment files
print_status "Setting up environment configuration..."

if [ ! -f "backend/.env" ]; then
    cp backend/.env.production backend/.env
    print_warning "Please update backend/.env with your actual database credentials and JWT secret!"
    print_warning "Edit: nano backend/.env"
fi

if [ ! -f "frontend/.env" ]; then
    cp frontend/.env.production frontend/.env
fi

# Step 7: Create required directories
print_status "Creating required directories..."
mkdir -p logs uploads
chmod 755 logs
chmod 777 uploads

# Step 8: Database setup
print_status "Setting up database..."
cd backend

# Check if we can connect to database
if ! npm run db:check 2>/dev/null; then
    print_warning "Database connection failed. Please ensure PostgreSQL is running and credentials are correct."
    print_warning "You may need to:"
    print_warning "1. Create the database: createdb etrax_production"
    print_warning "2. Update DATABASE_URL in backend/.env"
    print_warning "3. Run: npx prisma migrate deploy"
else
    # Run migrations
    print_status "Running database migrations..."
    npx prisma generate
    npx prisma migrate deploy
fi

cd ..

# Step 9: Setup PM2
print_status "Starting application with PM2..."

# Stop existing PM2 processes
if npx pm2 list | grep -q "$APP_NAME"; then
    print_status "Stopping existing PM2 process..."
    npx pm2 stop "$APP_NAME"
    npx pm2 delete "$APP_NAME"
fi

# Start new process
npx pm2 start ecosystem.config.js

# Save PM2 configuration
npx pm2 save

# Setup startup script
print_status "Setting up PM2 startup script..."
npx pm2 startup --user $USER --hp $HOME

# Step 10: Verification
print_status "Verifying deployment..."

# Wait for application to start
sleep 5

# Check PM2 status
if npx pm2 list | grep -q "online"; then
    print_status "✅ PM2 process is running"
else
    print_error "❌ PM2 process failed to start"
    npx pm2 logs --lines 20
    exit 1
fi

# Test API health
if curl -f -s http://localhost:8080/api/health > /dev/null; then
    print_status "✅ Backend API is responding"
else
    print_warning "⚠️  Backend API health check failed"
fi

# Check if frontend files exist
if [ -d "frontend/dist" ] && [ -f "frontend/dist/index.html" ]; then
    print_status "✅ Frontend build files are present"
else
    print_error "❌ Frontend build files are missing"
fi

# Final status
print_status "🎉 ETrax deployment complete!"
echo
echo "📋 Next steps:"
echo "1. Verify application at: http://74.208.111.202:8080/api/health"
echo "2. Configure nginx proxy (if permitted) using SHARED_SERVER_NOTES.md"
echo "3. Test full application functionality"
echo
echo "📊 Monitoring:"
echo "- PM2 status: npx pm2 status"
echo "- View logs: npx pm2 logs $APP_NAME"
echo "- Monitor: npx pm2 monit"
echo
print_status "Deployment log saved to: $DEPLOY_DIR/deployment.log"