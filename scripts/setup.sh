#!/bin/bash

# ETrax Development Setup Script
set -e

echo "🚀 Setting up ETrax development environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check Node.js version
echo "Checking Node.js version..."
NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="23.0.0"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    print_error "Node.js version $NODE_VERSION is too old. Please install Node.js 23.0.0 or later."
    exit 1
fi
print_status "Node.js version $NODE_VERSION is compatible"

# Check Docker
echo "Checking Docker..."
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker Desktop."
    exit 1
fi
print_status "Docker is installed"

# Check Docker Compose
echo "Checking Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose."
    exit 1
fi
print_status "Docker Compose is installed"

# Copy environment files
echo "Setting up environment files..."
if [ ! -f .env ]; then
    cp .env.example .env
    print_status "Created root .env file"
else
    print_warning ".env file already exists"
fi

if [ ! -f backend/.env ]; then
    cp backend/.env.example backend/.env
    print_status "Created backend .env file"
else
    print_warning "backend/.env file already exists"
fi

if [ ! -f frontend/.env ]; then
    cp frontend/.env.example frontend/.env
    print_status "Created frontend .env file"
else
    print_warning "frontend/.env file already exists"
fi

# Install root dependencies
echo "Installing root dependencies..."
npm install
print_status "Root dependencies installed"

# Install workspace dependencies
echo "Installing workspace dependencies..."
npm run setup
print_status "Workspace dependencies installed"

# Build shared package
echo "Building shared package..."
cd shared && npm run build && cd ..
print_status "Shared package built"

# Start Docker services
echo "Starting Docker services..."
docker-compose up -d postgres redis
print_status "Database and Redis services started"

# Wait for database to be ready
echo "Waiting for database to be ready..."
sleep 10

# Run database migrations
echo "Running database migrations..."
cd backend && npx prisma migrate dev --name init && cd ..
print_status "Database migrations completed"

# Generate Prisma client
echo "Generating Prisma client..."
cd backend && npx prisma generate && cd ..
print_status "Prisma client generated"

# Seed database (optional)
echo "Seeding database with sample data..."
cd backend && npm run db:seed && cd ..
print_status "Database seeded"

echo ""
echo "🎉 ETrax development environment setup complete!"
echo ""
echo "Quick commands:"
echo "  npm run dev          - Start development servers"
echo "  npm run docker:up    - Start Docker services"
echo "  npm run docker:down  - Stop Docker services"
echo "  npm run test         - Run all tests"
echo "  npm run build        - Build for production"
echo ""
echo "URLs:"
echo "  Frontend:     http://localhost:5173"
echo "  Backend API:  http://localhost:3000"
echo "  Database UI:  http://localhost:8080 (run with --profile tools)"
echo "  Redis UI:     http://localhost:8081 (run with --profile tools)"
echo ""
echo "Environment files have been created. Please review and update them with your specific configuration."
print_warning "Make sure to change JWT_SECRET and database passwords before deploying to production!"