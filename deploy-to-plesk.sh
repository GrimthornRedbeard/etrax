#!/bin/bash

# ETrax Plesk Shared Server Deployment Script
# Deploy to etrax.app domain on 74.208.111.202

set -e  # Exit on any error

echo "🚀 Starting ETrax deployment to Plesk shared server..."

# Configuration
SERVER="74.208.111.202"
USER="etrax"
SSH_KEY="$HOME/.ssh/etrax_ed25519"
VHOST_PATH="/var/www/vhosts/etrax.app"
REPO_URL="https://github.com/GrimthornRedbeard/etrax.git"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Test SSH connection
print_status "Testing SSH connection..."
if ! ssh -i "$SSH_KEY" -o ConnectTimeout=10 "$USER@$SERVER" "echo 'SSH connection successful'"; then
    print_error "SSH connection failed. Check your SSH key and server access."
    exit 1
fi

# Step 1: Build frontend locally
print_status "Building frontend locally..."
cd frontend
npm install
npm run build
cd ..

# Step 2: Deploy backend files
print_status "Deploying backend files to server..."
ssh -i "$SSH_KEY" "$USER@$SERVER" "
    # Create backend directory
    mkdir -p $VHOST_PATH/backend
    
    # Remove old backend if exists
    rm -rf $VHOST_PATH/backend/*
    
    # Create temp directory for clone
    rm -rf /tmp/etrax-deploy
    mkdir -p /tmp/etrax-deploy
"

# Clone repository on server
ssh -i "$SSH_KEY" "$USER@$SERVER" "
    cd /tmp/etrax-deploy
    git clone $REPO_URL .
    
    # Copy backend files
    cp -r backend/* $VHOST_PATH/backend/
    cp ecosystem.config.js $VHOST_PATH/backend/
    cp package.json $VHOST_PATH/backend/
    
    # Install backend dependencies
    cd $VHOST_PATH/backend
    npm install --production
    npm run build
    
    # Setup environment
    cp .env.production .env
    
    # Create required directories
    mkdir -p logs uploads
    chmod 755 logs
    chmod 777 uploads
    
    # Clean up temp directory
    rm -rf /tmp/etrax-deploy
"

# Step 3: Deploy frontend files
print_status "Deploying frontend files to server..."

# Create a temporary tar file of the frontend build
cd frontend/dist
tar -czf ../../frontend-build.tar.gz .
cd ../..

# Transfer and extract frontend files
scp -i "$SSH_KEY" frontend-build.tar.gz "$USER@$SERVER:$VHOST_PATH/"

ssh -i "$SSH_KEY" "$USER@$SERVER" "
    cd $VHOST_PATH
    
    # Backup existing files
    if [ -d httpdocs.backup ]; then
        rm -rf httpdocs.backup
    fi
    cp -r httpdocs httpdocs.backup
    
    # Extract new frontend
    tar -xzf frontend-build.tar.gz -C httpdocs/
    rm frontend-build.tar.gz
    
    # Set proper permissions
    chmod -R 755 httpdocs/
"

# Clean up local build archive
rm -f frontend-build.tar.gz

# Step 4: Database setup (if needed)
print_status "Checking database setup..."
ssh -i "$SSH_KEY" "$USER@$SERVER" "
    cd $VHOST_PATH/backend
    
    # Test database connection
    if npm run db:check 2>/dev/null; then
        echo 'Database connection successful'
        
        # Run migrations
        npx prisma generate
        npx prisma migrate deploy
    else
        echo 'Database connection failed - please configure database manually'
    fi
"

# Step 5: Start/restart backend with PM2
print_status "Starting backend with PM2..."
ssh -i "$SSH_KEY" "$USER@$SERVER" "
    cd $VHOST_PATH/backend
    
    # Stop existing PM2 process
    if npx pm2 list | grep -q etrax-backend; then
        npx pm2 stop etrax-backend
        npx pm2 delete etrax-backend
    fi
    
    # Start new process
    npx pm2 start ecosystem.config.js
    npx pm2 save
    
    # Setup startup if not already done
    npx pm2 startup --user etrax --hp /var/www/vhosts/etrax.app
"

# Step 6: Verification
print_status "Verifying deployment..."
sleep 5

# Test backend API
if ssh -i "$SSH_KEY" "$USER@$SERVER" "curl -f -s http://localhost:8080/api/health > /dev/null"; then
    print_status "✅ Backend API is responding"
else
    print_warning "⚠️  Backend API health check failed - checking logs..."
    ssh -i "$SSH_KEY" "$USER@$SERVER" "npx pm2 logs etrax-backend --lines 10"
fi

# Test frontend
if curl -f -s http://74.208.111.202 > /dev/null 2>&1; then
    print_status "✅ Frontend is accessible"
else
    print_warning "⚠️  Frontend accessibility check failed"
fi

# Final status
print_status "🎉 ETrax deployment complete!"
echo
echo "📋 Access URLs:"
echo "- Application: http://74.208.111.202"
echo "- API Health: http://74.208.111.202:8080/api/health" 
echo "- API Docs: http://74.208.111.202:8080/api-docs"
echo
echo "📊 Management:"
echo "- PM2 Status: ssh -i ~/.ssh/etrax_ed25519 etrax@74.208.111.202 'npx pm2 status'"
echo "- View Logs: ssh -i ~/.ssh/etrax_ed25519 etrax@74.208.111.202 'npx pm2 logs etrax-backend'"
echo
print_status "Deployment completed successfully!"