# 🚀 ETrax Production Deployment Guide

## 📋 Pre-Deployment Checklist

### ✅ System Requirements
- [ ] Node.js 18+ installed on production server
- [ ] PostgreSQL 13+ database server
- [ ] Redis server (for session storage and caching)
- [ ] Nginx web server (for reverse proxy)
- [ ] PM2 process manager
- [ ] SSL/TLS certificates configured
- [ ] Domain name configured and DNS records set

### ✅ Environment Configuration
- [ ] OAuth2 providers configured (Google, Microsoft, GitHub)
- [ ] SMTP/Email service configured
- [ ] JWT secrets generated (secure, unique)
- [ ] Database connection string configured
- [ ] Frontend URL configured correctly
- [ ] All required environment variables set

### ✅ Security Configuration
- [ ] Firewall configured (allow 80, 443, SSH only)
- [ ] SSH key authentication enabled
- [ ] Database access restricted to application server
- [ ] Redis secured with authentication
- [ ] Rate limiting configured
- [ ] CORS properly configured

## 🛠️ Deployment Steps

### 1. Server Preparation

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install Nginx
sudo apt install nginx -y

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# Install Redis
sudo apt install redis-server -y
```

### 2. Database Setup

```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE etrax_production;
CREATE USER etrax_user WITH ENCRYPTED PASSWORD 'secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE etrax_production TO etrax_user;
ALTER USER etrax_user CREATEDB;
\q

# Configure PostgreSQL for production
sudo nano /etc/postgresql/13/main/postgresql.conf
# Set: listen_addresses = 'localhost'
# Set: max_connections = 100

sudo systemctl restart postgresql
```

### 3. Application Deployment

```bash
# Clone repository
git clone https://github.com/GrimthornRedbeard/etrax.git
cd etrax/backend

# Install dependencies
npm ci --only=production

# Copy environment configuration
cp .env.example .env
nano .env  # Configure all environment variables

# Run database migrations
npm run db:migrate:prod

# Build application
npm run build

# Run deployment script
./scripts/deploy-auth-system.sh
```

### 4. OAuth2 Provider Configuration

Run the OAuth2 setup script:
```bash
./scripts/setup-oauth2-providers.sh
```

Or configure manually:

#### Google OAuth2
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project → APIs & Services → Credentials
3. Create OAuth 2.0 Client ID
4. Add redirect URI: `https://yourdomain.com/api/auth/google/callback`

#### Microsoft OAuth2
1. Go to [Azure Portal](https://portal.azure.com/)
2. App registrations → New registration
3. Add redirect URI: `https://yourdomain.com/api/auth/microsoft/callback`
4. API permissions → Microsoft Graph → User.Read

#### GitHub OAuth2
1. Go to GitHub → Settings → Developer settings → OAuth Apps
2. Create OAuth App
3. Callback URL: `https://yourdomain.com/api/auth/github/callback`

### 5. Nginx Configuration

```nginx
# /etc/nginx/sites-available/etrax
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate /path/to/ssl/certificate.crt;
    ssl_certificate_key /path/to/ssl/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=auth:10m rate=10r/m;
    limit_req_zone $binary_remote_addr zone=api:10m rate=60r/m;

    # Frontend (React build)
    location / {
        root /var/www/etrax/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Authentication endpoints (strict rate limiting)
    location /api/auth/ {
        limit_req zone=auth burst=5 nodelay;
        proxy_pass http://localhost:8080;
        include proxy_params;
    }

    # Admin endpoints (very strict rate limiting)
    location /api/admin/ {
        limit_req zone=auth burst=3 nodelay;
        proxy_pass http://localhost:8080;
        include proxy_params;
    }

    # General API endpoints
    location /api/ {
        limit_req zone=api burst=10 nodelay;
        proxy_pass http://localhost:8080;
        include proxy_params;
    }

    # Health check (no rate limiting)
    location /health {
        proxy_pass http://localhost:8080;
        include proxy_params;
    }
}

# /etc/nginx/proxy_params
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_cache_bypass $http_upgrade;
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection 'upgrade';
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/etrax /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 6. PM2 Process Management

```bash
# Start application with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save
pm2 startup

# Monitor application
pm2 monit
```

### 7. SSL Certificate Setup (Let's Encrypt)

```bash
# Install Certbot
sudo apt install snapd
sudo snap install core; sudo snap refresh core
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot

# Obtain SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Test automatic renewal
sudo certbot renew --dry-run
```

## 📊 Post-Deployment Verification

### 1. Health Checks

```bash
# Check application health
curl https://yourdomain.com/health

# Check authentication endpoints
curl https://yourdomain.com/api/auth/providers

# Check database connection
curl https://yourdomain.com/api/health/db
```

### 2. Authentication Testing

```bash
# Test OAuth2 providers
curl -L https://yourdomain.com/api/auth/google
curl -L https://yourdomain.com/api/auth/microsoft  
curl -L https://yourdomain.com/api/auth/github

# Test local registration
curl -X POST https://yourdomain.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"SecurePass123!","firstName":"Test","lastName":"User"}'
```

### 3. Performance Testing

```bash
# Test response times
curl -o /dev/null -s -w "%{time_total}\n" https://yourdomain.com/api/health

# Test concurrent requests
ab -n 100 -c 10 https://yourdomain.com/api/health
```

### 4. Security Testing

```bash
# Test rate limiting
for i in {1..20}; do curl -s -o /dev/null -w "%{http_code}\n" https://yourdomain.com/api/auth/providers; done

# Test SSL configuration
curl -I https://yourdomain.com

# Test CORS headers
curl -H "Origin: https://malicious-site.com" -I https://yourdomain.com/api/health
```

## 🔧 Monitoring & Maintenance

### 1. Log Management

```bash
# Application logs
pm2 logs etrax-backend

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# System logs
sudo journalctl -f -u nginx
sudo journalctl -f -u postgresql
```

### 2. Database Maintenance

```bash
# Create database backup
pg_dump -h localhost -U etrax_user etrax_production > etrax_backup_$(date +%Y%m%d).sql

# Automated backup script
#!/bin/bash
BACKUP_DIR="/backups/etrax"
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -h localhost -U etrax_user etrax_production | gzip > "$BACKUP_DIR/etrax_$DATE.sql.gz"
find $BACKUP_DIR -name "etrax_*.sql.gz" -mtime +30 -delete
```

### 3. Performance Monitoring

Set up monitoring with tools like:
- **PM2 Monit**: Built-in process monitoring
- **Prometheus + Grafana**: Metrics and dashboards
- **Sentry**: Error tracking and performance monitoring
- **LogRocket**: Session replay and debugging

### 4. Security Monitoring

```bash
# Monitor failed authentication attempts
grep "authentication error" /var/log/nginx/access.log

# Monitor rate limiting triggers
grep "429" /var/log/nginx/access.log

# Monitor database connections
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity WHERE datname='etrax_production';"
```

## 🚨 Troubleshooting

### Common Issues

**1. Application won't start**
```bash
# Check PM2 logs
pm2 logs etrax-backend

# Check environment variables
pm2 env etrax-backend

# Restart application
pm2 restart etrax-backend
```

**2. Database connection issues**
```bash
# Test database connection
psql -h localhost -U etrax_user -d etrax_production

# Check PostgreSQL status
sudo systemctl status postgresql
```

**3. OAuth2 authentication fails**
```bash
# Check OAuth2 configuration
grep -E "(GOOGLE_CLIENT_ID|MICROSOFT_CLIENT_ID|GITHUB_CLIENT_ID)" .env

# Verify redirect URIs in provider settings
# Check FRONTEND_URL configuration
```

**4. Email service issues**
```bash
# Test SMTP connection
npm run test:email

# Check email service logs in PM2
pm2 logs | grep -i email
```

### Emergency Procedures

**Application Recovery**
```bash
# Stop all services
pm2 stop all
sudo systemctl stop nginx

# Restore from backup
pm2 delete all
git checkout main
npm ci
npm run build
pm2 start ecosystem.config.js

# Restart services  
sudo systemctl start nginx
```

**Database Recovery**
```bash
# Stop application
pm2 stop etrax-backend

# Restore database
gunzip -c etrax_backup_YYYYMMDD.sql.gz | psql -h localhost -U etrax_user -d etrax_production

# Restart application
pm2 start etrax-backend
```

## 📈 Scaling Considerations

### Horizontal Scaling
- Load balancer configuration (HAProxy/AWS ALB)
- Database read replicas
- Redis clustering
- CDN for static assets

### Vertical Scaling
- Increase server resources (CPU, RAM)
- Database connection pooling
- PM2 cluster mode optimization
- Nginx worker processes tuning

### Performance Optimization
- Database indexing optimization
- JWT token caching
- Response compression
- Static asset optimization
- API response caching

## 🔒 Security Best Practices

1. **Regular Updates**
   - Keep all dependencies updated
   - Apply OS security patches
   - Rotate JWT secrets periodically

2. **Access Control**
   - Use SSH keys only, disable password authentication
   - Implement fail2ban for SSH protection
   - Regular security audits with `npm audit`

3. **Data Protection**
   - Encrypt database backups
   - Use environment variables for secrets
   - Implement proper CORS policies
   - Enable HSTS and security headers

4. **Monitoring**
   - Set up alerts for failed logins
   - Monitor unusual traffic patterns
   - Track authentication metrics
   - Regular penetration testing

## 📚 Additional Resources

- [ETrax Authentication Architecture](./AUTHENTICATION_ARCHITECTURE.md)
- [ETrax Implementation Status](./AUTHENTICATION_IMPLEMENTATION_STATUS.md)
- [OAuth2 Setup Script](./backend/scripts/setup-oauth2-providers.sh)
- [Deployment Script](./backend/scripts/deploy-auth-system.sh)

---

**🎯 Production deployment complete!** Your ETrax authentication system is now running in production with enterprise-grade security, scalability, and monitoring.