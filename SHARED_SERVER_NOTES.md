# 🌐 ETrax Shared Server Deployment Notes

## 📋 **Shared Environment Considerations**

### ⚠️ **Important Restrictions for Shared Server:**

#### **DO NOT MODIFY:**
- ❌ Firewall settings (`ufw`, `iptables`)
- ❌ System-wide services (nginx, apache, postgresql if pre-installed)
- ❌ Global Node.js version or PM2 global settings
- ❌ SSL certificates for the main domain
- ❌ System users or groups
- ❌ Network configurations

#### **SAFE TO CONFIGURE:**
- ✅ Application-specific directories under `/var/www/etrax/`
- ✅ User-level PM2 processes
- ✅ Application environment variables
- ✅ Local database connections (if permitted)
- ✅ Application logs in designated directories

## 🔧 **ETrax Specific Configurations**

### **Port Usage:**
- **Backend API**: Port 8080 (non-privileged port)
- **Frontend Dev**: Port 5174 (development only)
- **Database**: Use existing PostgreSQL instance if available

### **File Structure:**
```
/var/www/etrax/
├── backend/                 # Node.js API server
├── frontend/               # React build files
├── uploads/                # File uploads directory
├── logs/                   # Application logs
├── .env.production         # Environment variables
└── ecosystem.config.js     # PM2 configuration
```

### **Process Management:**
```bash
# Use user-level PM2 (not global)
npx pm2 start ecosystem.config.js
npx pm2 save
npx pm2 startup --user $USER --hp $HOME
```

## 🔍 **Pre-Deployment Checks**

### **1. Port Availability Check:**
```bash
# Check if port 8080 is available
netstat -tlnp | grep :8080
# Should return empty (port available)

# Test port binding
node -e "require('http').createServer().listen(8080, () => console.log('Port 8080 available')).on('error', err => console.log('Port 8080 in use:', err.message))"
```

### **2. Database Access:**
```bash
# Check PostgreSQL access
psql --version
psql -h localhost -U postgres -c "SELECT version();"
```

### **3. Node.js Version:**
```bash
# Check Node.js version (should be 18+)
node --version
npm --version
```

### **4. Directory Permissions:**
```bash
# Ensure proper permissions for application directory
sudo chown -R $USER:$USER /var/www/etrax/
chmod -R 755 /var/www/etrax/
chmod -R 777 /var/www/etrax/uploads/
chmod -R 755 /var/www/etrax/logs/
```

## 🚀 **Simplified Deployment Steps for Shared Server**

### **Step 1: Upload and Setup**
```bash
# Create application directory
sudo mkdir -p /var/www/etrax
sudo chown $USER:$USER /var/www/etrax

# Upload files (replace with your method)
# scp -r local-etrax-folder/* user@74.208.111.202:/var/www/etrax/

# Or use git
cd /var/www/etrax
git clone https://github.com/your-username/etrax.git .
```

### **Step 2: Install Dependencies**
```bash
cd /var/www/etrax

# Install backend dependencies
cd backend
npm install --only=production
npm run build

# Install frontend dependencies and build
cd ../frontend
npm install
npm run build
```

### **Step 3: Database Setup (if allowed)**
```bash
# Create database (adjust connection details as needed)
createdb etrax_production

# Run migrations
cd /var/www/etrax/backend
npx prisma migrate deploy
npx prisma generate
```

### **Step 4: Start Application**
```bash
cd /var/www/etrax

# Start with PM2 (user-level)
npx pm2 start ecosystem.config.js
npx pm2 save
npx pm2 startup --user $USER --hp $HOME
```

## 🔧 **Nginx Configuration (if you have access)**

If you have access to modify nginx configs, create a site configuration:

```nginx
# /etc/nginx/sites-available/etrax (if permitted)
server {
    listen 80;
    server_name 74.208.111.202;
    
    # Serve frontend static files
    root /var/www/etrax/frontend/dist;
    index index.html;
    
    # Frontend routing
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # API proxy to backend on port 8080
    location /api/ {
        proxy_pass http://localhost:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 🔍 **Alternative Access Methods**

If nginx configuration is not available:

### **Option 1: Direct Port Access**
- Frontend: Upload built files to web directory
- Backend API: Access directly via `http://74.208.111.202:8080/api`

### **Option 2: Subdirectory Deployment**
```bash
# Place frontend build in a subdirectory
mkdir -p /var/www/html/etrax
cp -r /var/www/etrax/frontend/dist/* /var/www/html/etrax/

# Access via: http://74.208.111.202/etrax
```

## 📊 **Monitoring & Maintenance**

### **Check Application Status:**
```bash
# PM2 status
npx pm2 status
npx pm2 logs etrax-backend

# Process monitoring
ps aux | grep node

# Port monitoring
netstat -tlnp | grep :8080
```

### **Log Files:**
```bash
# Application logs
tail -f /var/www/etrax/logs/backend.log

# PM2 logs
npx pm2 logs etrax-backend --lines 50
```

## ⚠️ **Troubleshooting Common Issues**

### **Port Already in Use:**
```bash
# Find process using port 8080
sudo lsof -i :8080
# Kill if necessary (only if it's your process)
kill -9 <PID>
```

### **Permission Issues:**
```bash
# Fix ownership
sudo chown -R $USER:$USER /var/www/etrax/

# Fix permissions
find /var/www/etrax -type f -exec chmod 644 {} \;
find /var/www/etrax -type d -exec chmod 755 {} \;
chmod +x /var/www/etrax/backend/dist/index.js
```

### **Database Connection:**
```bash
# Test connection
cd /var/www/etrax/backend
node -e "require('./dist/config/database.js').testConnection()"
```

## 📝 **Shared Server Deployment Checklist**

- [ ] Confirmed port 8080 is available
- [ ] No firewall modifications made
- [ ] Application runs in user space only
- [ ] Used relative paths for all configurations
- [ ] Logs stored in application directory
- [ ] No system-wide service modifications
- [ ] Used npx instead of global PM2
- [ ] Database credentials obtained from server admin
- [ ] File permissions properly set
- [ ] Tested application functionality

## 📞 **Support & Coordination**

### **Server Administrator Coordination:**
1. **Port Request**: "Need port 8080 for Node.js application"
2. **Database Access**: "Need PostgreSQL database and user credentials"
3. **File Permissions**: "Need write access to /var/www/etrax/"
4. **Web Server**: "Need nginx proxy from /api/ to localhost:8080 (optional)"

This approach ensures ETrax deploys safely on the shared server without interfering with existing services or configurations.