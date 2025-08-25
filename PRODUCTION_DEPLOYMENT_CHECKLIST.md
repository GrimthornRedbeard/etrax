# 🚀 ETrax Production Server Deployment Checklist

## 📋 Pre-Deployment Verification

### Local Repository Status
- [x] All code committed to main branch
- [x] Code pushed to GitHub repository
- [x] Repository URL: https://github.com/GrimthornRedbeard/etrax

## 🖥️ Production Server Steps

### Step 1: Connect to Production Server
```bash
ssh user@74.208.111.202
```

### Step 2: Clone Repository
```bash
cd /var/www
sudo mkdir -p etrax
sudo chown $USER:$USER etrax
cd etrax
git clone https://github.com/GrimthornRedbeard/etrax.git .
```

### Step 3: Install Dependencies
```bash
# Backend dependencies
cd backend
npm install --production
npm run build

# Frontend dependencies and build
cd ../frontend
npm install
npm run build
```

### Step 4: Environment Configuration
```bash
# Copy production environment files
cp backend/.env.production backend/.env
cp frontend/.env.production frontend/.env

# Update database credentials in backend/.env
nano backend/.env
# Update DATABASE_URL with actual PostgreSQL credentials
# Update JWT_SECRET with secure random string
# Update EMAIL credentials if needed
```

### Step 5: Database Setup
```bash
cd backend

# Create database (if not exists)
createdb etrax_production

# Run migrations
npx prisma generate
npx prisma migrate deploy

# Seed initial data (optional)
npm run seed:production
```

### Step 6: Create PM2 Ecosystem File
```bash
cd /var/www/etrax
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'etrax-backend',
    script: './backend/dist/index.js',
    cwd: '/var/www/etrax',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 8080,
      HOST: '0.0.0.0'
    },
    error_file: './logs/backend-error.log',
    out_file: './logs/backend-out.log',
    log_file: './logs/backend.log',
    time: true,
    merge_logs: true,
    max_memory_restart: '1G'
  }]
};
EOF
```

### Step 7: Create Log Directory
```bash
mkdir -p /var/www/etrax/logs
mkdir -p /var/www/etrax/uploads
chmod 755 /var/www/etrax/logs
chmod 777 /var/www/etrax/uploads
```

### Step 8: Start Application with PM2
```bash
# Start application
npx pm2 start ecosystem.config.js

# Save PM2 configuration
npx pm2 save

# Setup PM2 startup (user-level)
npx pm2 startup --user $USER --hp $HOME
# Copy and run the command provided by PM2
```

### Step 9: Nginx Configuration (if permitted)
```bash
# Check if you have permission to modify nginx
sudo nginx -t

# If allowed, create site configuration
sudo tee /etc/nginx/sites-available/etrax << 'EOF'
server {
    listen 80;
    server_name 74.208.111.202;
    
    root /var/www/etrax/frontend/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api/ {
        proxy_pass http://localhost:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/etrax /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## ✅ Post-Deployment Verification

### 1. Backend API Health Check
```bash
curl -X GET http://localhost:8080/api/health
# Expected: {"status":"OK","timestamp":"..."}
```

### 2. Frontend Access Test
```bash
curl -I http://74.208.111.202
# Expected: 200 OK
```

### 3. Database Connection Test
```bash
cd /var/www/etrax/backend
npx prisma db pull
# Should connect without errors
```

### 4. PM2 Process Status
```bash
npx pm2 status
# Should show etrax-backend as online
```

### 5. Check Logs for Errors
```bash
npx pm2 logs etrax-backend --lines 50
tail -f /var/www/etrax/logs/backend.log
```

## 🔍 Verification URLs

Once deployed, test these URLs:

1. **Frontend Application**: http://74.208.111.202
2. **API Health Check**: http://74.208.111.202:8080/api/health
3. **API Documentation**: http://74.208.111.202:8080/api-docs

## 🚨 Troubleshooting

### Port 8080 Already in Use
```bash
# Check what's using port 8080
sudo lsof -i :8080
# If it's safe to stop, kill the process
# Otherwise, update PORT in ecosystem.config.js and .env
```

### Permission Denied Errors
```bash
# Fix ownership
sudo chown -R $USER:$USER /var/www/etrax/
# Fix permissions
chmod -R 755 /var/www/etrax/
chmod -R 777 /var/www/etrax/uploads/
```

### Database Connection Failed
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql
# Test connection
psql -U postgres -h localhost
```

### PM2 Not Starting
```bash
# Check PM2 logs
npx pm2 logs etrax-backend --err
# Restart with verbose logging
npx pm2 delete all
npx pm2 start ecosystem.config.js --log-date-format="YYYY-MM-DD HH:mm:ss"
```

## 📊 Performance Monitoring

### Monitor Application
```bash
# Real-time monitoring
npx pm2 monit

# Process information
npx pm2 info etrax-backend

# Resource usage
npx pm2 describe etrax-backend
```

## 🔄 Update Deployment

When deploying updates:
```bash
cd /var/www/etrax
git pull origin main
cd backend && npm install --production && npm run build
cd ../frontend && npm install && npm run build
npx pm2 reload etrax-backend
```

## ✅ Deployment Complete!

Once all checks pass, ETrax is ready for production use at:
- **Application**: http://74.208.111.202
- **API**: http://74.208.111.202:8080/api