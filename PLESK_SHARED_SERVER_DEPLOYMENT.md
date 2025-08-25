# 🌐 ETrax Plesk Shared Server Deployment Guide

## 📋 **Server Environment Analysis**

**Server Type:** Plesk-managed shared hosting server  
**Web Server:** nginx (managed by Plesk)  
**Current Status:** Serving default Plesk page on port 80  
**Deployment Strategy:** Subdirectory-based application  

## ⚠️ **Critical Deployment Considerations**

### **DO NOT MODIFY:**
- ❌ Main nginx configuration (managed by Plesk)
- ❌ Port 80 configuration (shared with other applications)
- ❌ SSL certificates for main domain
- ❌ System-wide services
- ❌ Plesk panel configurations

### **SAFE DEPLOYMENT OPTIONS:**

#### **Option 1: Plesk Vhost Deployment (Recommended)**
- ✅ Deploy frontend to `/var/www/vhosts/etrax/httpdocs/`
- ✅ Backend in `/var/www/vhosts/etrax/backend/` on port 8080
- ✅ Access via: `http://74.208.111.202` (if main domain)
- ✅ API via: `http://74.208.111.202:8080/api`

#### **Option 2: Plesk Domain/Subdomain**
- ✅ Create subdomain in Plesk (if permitted)
- ✅ Deploy to subdomain document root
- ✅ Access via: `http://etrax.74.208.111.202`

## 🚀 **Subdirectory Deployment Instructions**

### **Step 1: Frontend Already Configured for Plesk**

The frontend is already configured with the correct base path:

```typescript
// frontend/vite.config.ts - Already updated
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/etrax/' : '/',
  // ... PWA manifest updated for /etrax/ paths
});
```

### **Step 2: Update Frontend Environment**

```bash
# frontend/.env.production
VITE_API_BASE_URL=http://74.208.111.202:8080/api
VITE_PUBLIC_PATH=/etrax/
VITE_APP_NAME=ETrax
```

### **Step 3: Deploy Frontend to Web Directory**

```bash
# SSH into server as etrax user
ssh etrax@74.208.111.202

# Use the correct Plesk vhost directory
cd /var/www/vhosts/etrax

# Clone repository
cd /tmp
git clone https://github.com/GrimthornRedbeard/etrax.git
cd etrax

# Build frontend with subdirectory base
cd frontend
npm install
npm run build

# Deploy frontend files to Plesk vhost directory
cp -r dist/* /var/www/vhosts/etrax/httpdocs/

# Set proper permissions
chmod -R 755 /var/www/vhosts/etrax/httpdocs/
```

### **Step 4: Deploy Backend Application**

```bash
# Create backend directory in vhost
mkdir -p /var/www/vhosts/etrax/backend
cd /var/www/vhosts/etrax/backend

# Copy backend files
cp -r /tmp/etrax/backend/* .
cp /tmp/etrax/ecosystem.config.js .
cp /tmp/etrax/package.json .

# Install dependencies and build
npm install --production
npm run build

# Setup environment
cp .env.production .env
# Edit .env with actual database credentials

# Create required directories
mkdir -p logs uploads
chmod 755 logs
chmod 777 uploads
```

### **Step 5: Start Backend with PM2**

```bash
# Start backend on port 8080
npx pm2 start ecosystem.config.js
npx pm2 save
npx pm2 startup --user etrax --hp $HOME
```

## 🔧 **Frontend Route Configuration**

### **Update React Router for Subdirectory**

```tsx
// frontend/src/main.tsx
import { createBrowserRouter } from 'react-router-dom';

const router = createBrowserRouter([
  // ... routes
], {
  basename: '/etrax'  // Add basename for subdirectory
});
```

### **Update API Base URL**

```typescript
// frontend/src/services/api.ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://74.208.111.202:8080/api';
```

## 🌐 **Alternative: Plesk Subdomain Setup**

If you have Plesk panel access:

### **Step 1: Create Subdomain**
1. Login to Plesk panel
2. Go to "Domains" > "Add Subdomain"
3. Create: `etrax.74.208.111.202`
4. Set document root to `/var/www/vhosts/74.208.111.202/etrax`

### **Step 2: Deploy to Subdomain**
```bash
# Deploy frontend to subdomain document root
cp -r frontend/dist/* /var/www/vhosts/74.208.111.202/etrax/

# Update base URL in frontend
# VITE_API_BASE_URL=http://etrax.74.208.111.202:8080/api
```

## 📊 **Access URLs After Deployment**

### **Subdirectory Deployment:**
- **Application:** `http://74.208.111.202/etrax`
- **API Health:** `http://74.208.111.202:8080/api/health`
- **API Docs:** `http://74.208.111.202:8080/api-docs`

### **Subdomain Deployment:**
- **Application:** `http://etrax.74.208.111.202`
- **API Health:** `http://74.208.111.202:8080/api/health`

## 🔍 **Testing Deployment**

### **Frontend Tests**
```bash
# Test main application
curl -I http://74.208.111.202/etrax/
# Expected: 200 OK, text/html

# Test static assets
curl -I http://74.208.111.202/etrax/assets/index.js
# Expected: 200 OK, application/javascript
```

### **Backend Tests**
```bash
# Test API health
curl http://74.208.111.202:8080/api/health
# Expected: {"status":"OK","timestamp":"..."}

# Test CORS with frontend origin
curl -X OPTIONS http://74.208.111.202:8080/api/auth/login \
  -H "Origin: http://74.208.111.202" \
  -H "Access-Control-Request-Method: POST"
# Expected: 204 No Content with CORS headers
```

## ⚠️ **Important Notes for Shared Server**

### **Port Usage:**
- Port 80: Shared by Plesk (DO NOT MODIFY)
- Port 8080: ETrax backend API (safe to use)
- Port 443: Shared SSL (managed by Plesk)

### **File Permissions:**
```bash
# Frontend permissions (Plesk vhost)
chmod -R 755 /var/www/vhosts/etrax/httpdocs/
chown -R etrax:psacln /var/www/vhosts/etrax/httpdocs/

# Backend directory permissions  
chmod -R 755 /var/www/vhosts/etrax/backend/
chown -R etrax:etrax /var/www/vhosts/etrax/backend/
```

### **Firewall Considerations:**
- Port 8080 should be open for API access
- No firewall modifications needed (using standard HTTP ports)
- Plesk manages main web server security

## 🚨 **Troubleshooting**

### **404 Errors on Frontend Routes**
- Ensure `.htaccess` or nginx rewrite rules for React Router
- Check `basename` configuration in React Router
- Verify static files are accessible

### **CORS Errors**
- Update `CORS_ORIGINS` in backend `.env`
- Include subdirectory URL: `http://74.208.111.202/etrax`

### **API Connection Issues**
- Verify backend is running on port 8080
- Check PM2 status: `npx pm2 status`
- Test direct API access: `curl localhost:8080/api/health`

## 📋 **Deployment Checklist for Shared Server**

- [ ] Frontend built with `/etrax/` base path
- [ ] Backend running on port 8080
- [ ] Frontend deployed to `/var/www/vhosts/etrax/httpdocs/`
- [ ] React Router configured with basename
- [ ] CORS configured for subdirectory origin
- [ ] API endpoints accessible from frontend
- [ ] Static assets loading correctly
- [ ] PM2 process running and saved
- [ ] No conflicts with existing Plesk applications

## 🎯 **Final URLs**

After successful deployment:
- **Main Application:** http://74.208.111.202/etrax
- **Login Page:** http://74.208.111.202/etrax/login  
- **Dashboard:** http://74.208.111.202/etrax/dashboard
- **API Health:** http://74.208.111.202:8080/api/health

This deployment strategy ensures ETrax works alongside other applications on the shared Plesk server without conflicts.