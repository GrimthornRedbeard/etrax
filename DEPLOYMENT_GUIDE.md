# 🚀 ETrax Production Deployment Guide

## 📋 Pre-Deployment Checklist

### ✅ **Environment Setup**
- [ ] Node.js 18+ installed on production server
- [ ] PostgreSQL 15+ database configured
- [ ] Redis server running
- [ ] SSL certificate obtained and configured
- [ ] Domain DNS configured to point to 74.208.111.202
- [ ] Port 8080 availability confirmed with server administrator

### ✅ **Production Configuration**

#### 1. Server Requirements
```bash
# Minimum server specifications:
- CPU: 2 cores
- RAM: 4GB
- Storage: 50GB SSD
- OS: Ubuntu 20.04+ or CentOS 8+
```

#### 2. Environment Variables
Create production environment files on the server:

**Backend (.env.production):**
```bash
NODE_ENV=production
PORT=8080
HOST=0.0.0.0
DATABASE_URL=postgresql://etrax_user:secure_password_here@localhost:5432/etrax_production
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-long-for-production
JWT_EXPIRES_IN=24h
CORS_ORIGINS=https://74.208.111.202,http://74.208.111.202
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-specific-password
```

**Frontend (.env.production):**
```bash
VITE_API_BASE_URL=https://74.208.111.202:8080/api
VITE_APP_NAME=ETrax
VITE_APP_VERSION=1.0.0
```

## 🔧 **Deployment Steps**

### Step 1: Server Preparation
```bash
# Connect to production server
ssh root@74.208.111.202

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install Redis
sudo apt install -y redis-server

# Install Nginx
sudo apt install -y nginx
```

### Step 2: Database Setup
```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE etrax_production;
CREATE USER etrax_user WITH ENCRYPTED PASSWORD 'secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE etrax_production TO etrax_user;
\q
```

### Step 3: Application Deployment
```bash
# Clone repository
cd /var/www
sudo git clone https://github.com/your-username/etrax.git
cd etrax

# Install dependencies
npm install --production

# Build frontend
cd frontend
npm run build

# Run database migrations
cd ../backend
npx prisma migrate deploy
npx prisma generate
```

### Step 4: Process Management
Create PM2 ecosystem file:

```bash
# Create ecosystem.config.js
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
    error_file: '/var/log/etrax/backend-error.log',
    out_file: '/var/log/etrax/backend-out.log',
    log_file: '/var/log/etrax/backend.log'
  }]
};
EOF

# Create log directory
sudo mkdir -p /var/log/etrax
sudo chown -R $USER:$USER /var/log/etrax

# Start application
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Step 5: Nginx Configuration
```bash
# Create Nginx configuration
sudo tee /etc/nginx/sites-available/etrax << 'EOF'
server {
    listen 80;
    listen 443 ssl http2;
    server_name 74.208.111.202;

    # SSL Configuration (update with your certificate paths)
    ssl_certificate /etc/ssl/certs/etrax.crt;
    ssl_certificate_key /etc/ssl/private/etrax.key;

    # Frontend - Serve React build
    root /var/www/etrax/frontend/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Frontend routing
    location / {
        try_files $uri $uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public, immutable";
    }

    # API proxy to backend
    location /api/ {
        proxy_pass http://localhost:8080/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name 74.208.111.202;
    return 301 https://$server_name$request_uri;
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/etrax /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 🔍 **Testing Deployment**

### 1. Backend API Test
```bash
curl -X GET http://74.208.111.202:8080/api/health
# Should return: {"status": "OK", "timestamp": "..."}
```

### 2. Frontend Access Test
```bash
curl -I http://74.208.111.202
# Should return 200 OK and serve React app
```

### 3. Database Connection Test
```bash
cd /var/www/etrax/backend
npm run test:db
```

## 🛡️ **Security Hardening**

### Firewall Configuration
```bash
# NOTE: Do not modify firewall settings on shared production server
# Firewall is managed by server administrator
# ETrax will use port 8080 - ensure this port is available
```

### SSL Certificate (Let's Encrypt)
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d 74.208.111.202

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## 📊 **Monitoring & Maintenance**

### Application Monitoring
```bash
# PM2 monitoring
pm2 monit

# View logs
pm2 logs etrax-backend

# Restart application
pm2 restart etrax-backend
```

### Database Backup
```bash
# Create backup script
cat > /home/backup/etrax-backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -U etrax_user etrax_production > /home/backup/etrax_backup_$DATE.sql
find /home/backup -name "etrax_backup_*.sql" -mtime +7 -delete
EOF

# Make executable
chmod +x /home/backup/etrax-backup.sh

# Add to crontab
crontab -e
# Add: 0 2 * * * /home/backup/etrax-backup.sh
```

## 🚀 **Go Live Checklist**

- [ ] Backend API responding on port 8080
- [ ] Frontend serving on port 80/443
- [ ] Database migrations applied
- [ ] Redis service running
- [ ] SSL certificate installed
- [ ] Nginx configuration active
- [ ] PM2 processes running
- [ ] Port 8080 confirmed available
- [ ] Backup scripts configured
- [ ] Monitoring setup complete

## 📞 **Post-Deployment Support**

### Common Issues & Solutions

**Issue: 502 Bad Gateway**
```bash
# Check backend status
pm2 status
pm2 logs etrax-backend

# Restart if needed
pm2 restart etrax-backend
```

**Issue: Database Connection Error**
```bash
# Check PostgreSQL service
sudo systemctl status postgresql
sudo systemctl start postgresql

# Test connection
psql -U etrax_user -d etrax_production -h localhost
```

**Issue: Frontend Not Loading**
```bash
# Check Nginx
sudo nginx -t
sudo systemctl status nginx
sudo systemctl restart nginx
```

## 🎯 **Success Metrics**

After deployment, verify:
- ✅ Application loads within 2 seconds
- ✅ All authentication flows work
- ✅ Equipment management functions properly  
- ✅ Dashboard displays real-time data
- ✅ Mobile responsive design works
- ✅ No console errors in browser
- ✅ API response times under 500ms

**🎉 ETrax is now ready for production use!**