# 🔍 ETrax Production Verification Guide

## 📋 Post-Deployment Verification Checklist

### 🖥️ Server Environment Checks

#### 1. Process Status Verification
```bash
# Check PM2 process status
npx pm2 status
# Expected: etrax-backend showing as "online" with 2 instances

# Detailed process information
npx pm2 info etrax-backend
# Expected: status "online", restart count low, memory usage reasonable
```

#### 2. Port and Network Verification
```bash
# Verify port 8080 is listening
netstat -tlnp | grep :8080
# Expected: tcp 0 0 0.0.0.0:8080 ... LISTEN

# Test local API connection
curl -X GET http://localhost:8080/api/health
# Expected: {"status":"OK","timestamp":"2025-01-XX..."}
```

#### 3. Database Connection Verification
```bash
cd /var/www/etrax/backend

# Test database connection
npx prisma db pull
# Expected: No errors, successful connection

# Check database tables
npx prisma studio --browser none --port 5555 &
# Expected: Prisma Studio starts without errors
curl -I http://localhost:5555
# Expected: 200 OK response
pkill -f "prisma studio"
```

### 🌐 Application Functionality Tests

#### 1. API Health Check
```bash
# Basic health endpoint
curl -v http://74.208.111.202:8080/api/health
# Expected: HTTP/1.1 200 OK with JSON response

# API documentation endpoint
curl -I http://74.208.111.202:8080/api-docs
# Expected: HTTP/1.1 200 OK (if enabled in production)
```

#### 2. Authentication Endpoints
```bash
# Test user registration endpoint
curl -X POST http://74.208.111.202:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!",
    "firstName": "Test",
    "lastName": "User",
    "role": "USER"
  }'
# Expected: 201 Created with user object (without password)

# Test login endpoint  
curl -X POST http://74.208.111.202:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!"
  }'
# Expected: 200 OK with access token and refresh token
```

#### 3. Equipment Management Endpoints
```bash
# Get equipment list (requires authentication)
# First login and get token
TOKEN=$(curl -s -X POST http://74.208.111.202:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPassword123!"}' \
  | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

# Test equipment endpoint
curl -H "Authorization: Bearer $TOKEN" \
  http://74.208.111.202:8080/api/equipment
# Expected: 200 OK with equipment array (may be empty initially)
```

### 🎨 Frontend Verification

#### 1. Static File Serving
```bash
# Test main application load
curl -I http://74.208.111.202
# Expected: HTTP/1.1 200 OK with text/html content-type

# Test React app assets
curl -I http://74.208.111.202/assets/index.js
# Expected: HTTP/1.1 200 OK with application/javascript content-type
```

#### 2. PWA Manifest and Service Worker
```bash
# Test PWA manifest
curl -I http://74.208.111.202/manifest.json
# Expected: HTTP/1.1 200 OK with application/json content-type

# Test service worker
curl -I http://74.208.111.202/sw.js
# Expected: HTTP/1.1 200 OK with application/javascript content-type
```

### 🔐 Security Verification

#### 1. CORS Configuration
```bash
# Test CORS preflight request
curl -X OPTIONS http://74.208.111.202:8080/api/auth/login \
  -H "Origin: http://74.208.111.202" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type"
# Expected: 204 No Content with CORS headers
```

#### 2. Security Headers
```bash
# Check security headers on API
curl -I http://74.208.111.202:8080/api/health
# Expected headers:
# - X-Content-Type-Options: nosniff
# - X-Frame-Options: DENY
# - X-XSS-Protection: 1; mode=block
```

#### 3. Rate Limiting
```bash
# Test rate limiting (make multiple rapid requests)
for i in {1..10}; do
  curl -s -o /dev/null -w "%{http_code} " http://74.208.111.202:8080/api/health
done
echo
# Expected: 200 responses, but may show 429 if rate limit exceeded
```

### 📊 Performance Verification

#### 1. Response Time Testing
```bash
# Test API response times
curl -w "Total time: %{time_total}s\n" -o /dev/null -s http://74.208.111.202:8080/api/health
# Expected: < 0.5 seconds for health check

# Test frontend load time
curl -w "Total time: %{time_total}s\n" -o /dev/null -s http://74.208.111.202
# Expected: < 2 seconds for initial load
```

#### 2. Memory and CPU Usage
```bash
# Check PM2 monitoring
npx pm2 monit
# Expected: Memory usage < 500MB per instance, CPU < 50% under normal load

# System resource check
htop
# Or use: ps aux | grep node
# Expected: Reasonable resource usage
```

### 📝 Log Verification

#### 1. Application Logs
```bash
# Check PM2 logs
npx pm2 logs etrax-backend --lines 50
# Expected: No critical errors, successful startup messages

# Check application log file
tail -f /var/www/etrax/logs/backend.log
# Expected: Info/debug messages, no errors during normal operation
```

#### 2. Error Log Analysis
```bash
# Check for errors in PM2 error log
cat /var/www/etrax/logs/backend-error.log | tail -20
# Expected: No recent errors or critical issues

# Check system logs for any issues
sudo journalctl -u nginx --since "1 hour ago" | grep error
# Expected: No nginx errors related to ETrax
```

### 🧪 End-to-End User Testing

#### 1. Browser Testing Checklist

**Desktop Testing (Chrome/Firefox/Safari):**
- [ ] Application loads at http://74.208.111.202
- [ ] Login form displays correctly
- [ ] Registration form works
- [ ] Dashboard loads after authentication
- [ ] Equipment list displays
- [ ] Add equipment form works
- [ ] QR code generation works
- [ ] Navigation between pages works
- [ ] Logout functionality works

**Mobile Testing:**
- [ ] Responsive design displays correctly
- [ ] Touch interactions work properly
- [ ] PWA install prompt appears (if supported)
- [ ] Camera access works for QR scanning
- [ ] Voice commands work (if supported)

#### 2. Functional Testing Scripts

```bash
# Create test user and verify workflow
./scripts/test-user-workflow.sh

# Test equipment management
./scripts/test-equipment-workflow.sh

# Test QR code functionality
./scripts/test-qr-workflow.sh
```

### 🔧 Troubleshooting Common Issues

#### Application Won't Start
```bash
# Check PM2 logs for startup errors
npx pm2 logs etrax-backend --err

# Verify environment variables
cat /var/www/etrax/backend/.env | grep -v "PASSWORD\|SECRET"

# Test database connection manually
cd /var/www/etrax/backend
node -e "require('./dist/config/database.js').testConnection()"
```

#### 502 Bad Gateway
```bash
# Check if backend is running
npx pm2 status

# Verify nginx configuration
sudo nginx -t

# Check nginx logs
sudo tail /var/log/nginx/error.log
```

#### Database Connection Errors
```bash
# Test PostgreSQL connection
psql -h localhost -U etrax_user -d etrax_production -c "SELECT NOW();"

# Check if database exists
psql -h localhost -U postgres -c "\l" | grep etrax
```

### ✅ Verification Summary

Create a verification report with these results:

```markdown
# ETrax Production Verification Report

**Date:** $(date)
**Server:** 74.208.111.202
**Version:** 1.0.0

## Status Summary
- [ ] PM2 Process: ONLINE
- [ ] Database: CONNECTED
- [ ] API Health: RESPONDING
- [ ] Frontend: LOADING
- [ ] Authentication: WORKING
- [ ] Equipment Management: FUNCTIONAL
- [ ] Performance: ACCEPTABLE
- [ ] Security: CONFIGURED
- [ ] Logs: NO CRITICAL ERRORS

## Issues Found
List any issues discovered during verification...

## Recommendations
List any improvements or configurations needed...
```

### 🎯 Success Criteria

The deployment is considered successful when:
- ✅ All API endpoints respond correctly
- ✅ Frontend application loads and functions
- ✅ User authentication works end-to-end
- ✅ Equipment management features are operational
- ✅ Database operations complete successfully
- ✅ No critical errors in logs
- ✅ Performance meets acceptable standards
- ✅ Security configurations are active

**🎉 Once all verifications pass, ETrax is ready for production use!**