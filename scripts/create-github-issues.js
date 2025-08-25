#!/usr/bin/env node

/**
 * GitHub Issues Creation Script for ETrax Development Roadmap
 * This script creates GitHub issues for each task in the 8-week development roadmap
 */

const fs = require('fs');
const path = require('path');

// GitHub issue templates based on the development roadmap
const issues = [
  // Week 1: Foundation & Core Backend
  {
    title: "🔐 Implement JWT Authentication System",
    body: `## Description
Implement secure JWT authentication system with refresh token support.

## Acceptance Criteria
- [ ] Login/logout endpoints
- [ ] Password reset functionality 
- [ ] Email verification system
- [ ] Refresh token rotation
- [ ] Account lockout after failed attempts
- [ ] Multi-tenant user isolation

## Technical Requirements
- Use JWT with RS256 algorithm
- Implement refresh token rotation
- Rate limit login attempts
- Email verification with expiry

## Definition of Done
- All endpoints tested and documented
- Security audit passed
- Integration tests written`,
    labels: ["week-1", "backend", "security", "authentication", "high-priority"],
    milestone: "Week 1: Foundation",
    assignees: []
  },

  {
    title: "👤 Build User Management & Registration System",
    body: `## Description
Complete user registration system with role assignment and validation.

## Acceptance Criteria
- [ ] User registration with role assignment
- [ ] Password strength validation
- [ ] Multi-tenant user isolation
- [ ] User profile management
- [ ] Role-based access control setup

## Technical Requirements
- Zod validation for user input
- bcrypt for password hashing
- Email validation and verification
- Role hierarchy implementation

## Definition of Done
- Registration flow complete
- Email verification working
- Role assignments functional`,
    labels: ["week-1", "backend", "user-management", "medium-priority"],
    milestone: "Week 1: Foundation",
    assignees: []
  },

  {
    title: "🏷️ Create Equipment CRUD Operations",
    body: `## Description
Implement complete CRUD operations for equipment management with filtering and search.

## Acceptance Criteria
- [ ] Create equipment endpoint with validation
- [ ] Read equipment with filtering/pagination
- [ ] Update equipment status and details
- [ ] Delete/archive equipment
- [ ] Equipment search functionality
- [ ] Image upload for equipment

## Technical Requirements
- Prisma ORM integration
- File upload with multer
- Advanced filtering and pagination
- Full-text search capability
- Image processing with Sharp

## Definition of Done
- All CRUD operations tested
- Search functionality working
- File upload system operational
- API documentation complete`,
    labels: ["week-1", "backend", "equipment", "crud", "high-priority"],
    milestone: "Week 1: Foundation",
    assignees: []
  },

  {
    title: "📂 Implement Categories & Locations Management",
    body: `## Description
Build hierarchical category and location management system.

## Acceptance Criteria
- [ ] Category management (hierarchical)
- [ ] Location management (hierarchical)
- [ ] Default sport categories seeding
- [ ] Location-based equipment filtering
- [ ] Category-specific equipment templates

## Technical Requirements
- Hierarchical data structure implementation
- Database seeding scripts
- Recursive queries for tree structures
- Template system for categories

## Definition of Done
- Hierarchical structures working
- Seeding scripts complete
- Templates implemented
- Filtering operational`,
    labels: ["week-1", "backend", "categories", "locations", "medium-priority"],
    milestone: "Week 1: Foundation",
    assignees: []
  },

  // Week 2: QR Codes & Transaction System
  {
    title: "📱 Build QR Code Generation & Management System",
    body: `## Description
Implement QR code generation with school branding and validation system.

## Acceptance Criteria
- [ ] QR code generation with school branding
- [ ] QR code validation and parsing
- [ ] Regeneration system for damaged codes
- [ ] QR code printing templates
- [ ] Batch QR code generation
- [ ] QR code lookup API

## Technical Requirements
- qrcode library integration
- SVG/PNG generation with logos
- Validation algorithms
- Batch processing capability
- Print-ready templates

## Definition of Done
- QR generation working with logos
- Batch operations functional
- Print templates ready
- Validation system complete`,
    labels: ["week-2", "backend", "qr-codes", "printing", "high-priority"],
    milestone: "Week 2: QR & Transactions",
    assignees: []
  },

  {
    title: "📋 Create Transaction & Equipment History System",
    body: `## Description
Implement comprehensive transaction tracking and equipment history system.

## Acceptance Criteria
- [ ] Transaction model implementation
- [ ] Check-in/check-out workflows
- [ ] Status change logging
- [ ] Equipment assignment tracking
- [ ] Location movement history
- [ ] Bulk transaction operations

## Technical Requirements
- Transaction model with audit trail
- Workflow state machine
- Bulk operation support
- History timeline generation
- Performance optimization for large datasets

## Definition of Done
- All transaction types supported
- History tracking complete
- Bulk operations working
- Performance benchmarks met`,
    labels: ["week-2", "backend", "transactions", "history", "high-priority"],
    milestone: "Week 2: QR & Transactions",
    assignees: []
  },

  {
    title: "🔄 Implement Equipment Status Workflow Engine",
    body: `## Description
Build status workflow engine with automatic transitions and alerts.

## Acceptance Criteria
- [ ] Status validation rules
- [ ] Automatic status transitions
- [ ] Maintenance scheduling
- [ ] Equipment condition tracking
- [ ] Alert system for status changes

## Technical Requirements
- State machine implementation
- Rule engine for transitions
- Scheduled job system
- Alert notification system
- Condition progression tracking

## Definition of Done
- Workflow engine operational
- Automatic transitions working
- Alert system functional
- Maintenance scheduling active`,
    labels: ["week-2", "backend", "workflow", "status", "medium-priority"],
    milestone: "Week 2: QR & Transactions",
    assignees: []
  },

  // Week 3: Frontend Core Development
  {
    title: "🎨 Build Authentication UI Components",
    body: `## Description
Create comprehensive authentication UI with responsive design.

## Acceptance Criteria
- [ ] Login/registration forms
- [ ] Password reset flow
- [ ] Email verification UI
- [ ] Role-based navigation
- [ ] User profile management
- [ ] Session management

## Technical Requirements
- React Hook Form integration
- Zod validation schemas
- Responsive design with Tailwind
- Error handling and feedback
- Loading states and animations

## Definition of Done
- All auth flows implemented
- Responsive design verified
- Error handling complete
- Accessibility standards met`,
    labels: ["week-3", "frontend", "authentication", "ui", "high-priority"],
    milestone: "Week 3: Frontend Core",
    assignees: []
  },

  {
    title: "🏷️ Create Equipment Management Interface",
    body: `## Description
Build comprehensive equipment management interface with CRUD operations.

## Acceptance Criteria
- [ ] Equipment list with filtering
- [ ] Equipment detail pages
- [ ] Add/edit equipment forms
- [ ] Image upload interface
- [ ] Status change interface
- [ ] Bulk operations UI

## Technical Requirements
- React Query for data fetching
- Advanced filtering components
- Image upload with preview
- Bulk selection interface
- Real-time updates with Socket.IO

## Definition of Done
- All CRUD operations working
- Filtering and search functional
- Image handling complete
- Bulk operations UI ready`,
    labels: ["week-3", "frontend", "equipment", "crud", "high-priority"],
    milestone: "Week 3: Frontend Core",
    assignees: []
  },

  {
    title: "📊 Build Dashboard & Navigation System",
    body: `## Description
Create main dashboard with key metrics and navigation system.

## Acceptance Criteria
- [ ] Dashboard with key metrics
- [ ] Navigation system
- [ ] Search functionality
- [ ] Quick actions toolbar
- [ ] Responsive design implementation

## Technical Requirements
- Chart library integration (Chart.js/Recharts)
- Responsive navigation patterns
- Global search implementation
- Quick action shortcuts
- Performance optimization

## Definition of Done
- Dashboard displaying metrics
- Navigation system complete
- Search functionality working
- Responsive design verified`,
    labels: ["week-3", "frontend", "dashboard", "navigation", "medium-priority"],
    milestone: "Week 3: Frontend Core",
    assignees: []
  },

  // Week 4: Mobile PWA & QR Scanning
  {
    title: "📱 Implement Progressive Web App Features",
    body: `## Description
Transform application into full-featured PWA with offline capabilities.

## Acceptance Criteria
- [ ] Service worker optimization
- [ ] Offline data caching
- [ ] Background sync setup
- [ ] Push notifications
- [ ] App installation prompts
- [ ] Offline fallback pages

## Technical Requirements
- Workbox for service worker management
- IndexedDB for offline storage
- Background sync with retry logic
- Web Push API integration
- App manifest configuration

## Definition of Done
- PWA fully functional offline
- Push notifications working
- Installation prompts active
- Background sync operational`,
    labels: ["week-4", "frontend", "pwa", "offline", "high-priority"],
    milestone: "Week 4: Mobile PWA",
    assignees: []
  },

  {
    title: "📸 Build QR Code Scanning Interface",
    body: `## Description
Implement QR code scanning with camera integration and result handling.

## Acceptance Criteria
- [ ] Camera integration
- [ ] QR code scanning interface
- [ ] Scan result handling
- [ ] Scan history
- [ ] Batch scanning capability
- [ ] Error handling for invalid codes

## Technical Requirements
- jsQR library integration
- Camera API usage
- Real-time scanning feedback
- History persistence
- Error state handling

## Definition of Done
- QR scanning working reliably
- Camera permissions handled
- Scan history functional
- Error handling complete`,
    labels: ["week-4", "frontend", "qr-scanning", "camera", "high-priority"],
    milestone: "Week 4: Mobile PWA",
    assignees: []
  },

  {
    title: "📱 Optimize Mobile User Experience",
    body: `## Description
Optimize application for mobile devices with touch-friendly interfaces.

## Acceptance Criteria
- [ ] Touch-friendly interfaces
- [ ] Mobile navigation patterns
- [ ] Gesture support
- [ ] Performance optimization
- [ ] Battery usage optimization

## Technical Requirements
- Touch event handling
- Mobile-first CSS
- Performance profiling
- Battery API integration
- Gesture recognition

## Definition of Done
- Mobile interface optimized
- Performance benchmarks met
- Battery usage minimized
- Touch interactions smooth`,
    labels: ["week-4", "frontend", "mobile", "ux", "medium-priority"],
    milestone: "Week 4: Mobile PWA",
    assignees: []
  },

  // Week 5: Voice Commands & AI Integration
  {
    title: "🎤 Implement Voice Recognition System",
    body: `## Description
Build voice recognition system with natural language processing.

## Acceptance Criteria
- [ ] Web Speech API integration
- [ ] Voice command processing
- [ ] Natural language parsing
- [ ] Intent recognition system
- [ ] Entity extraction
- [ ] Confidence scoring

## Technical Requirements
- Web Speech API implementation
- NLP processing algorithms
- Intent classification
- Entity extraction rules
- Confidence threshold handling

## Definition of Done
- Voice recognition functional
- Command processing accurate
- Intent classification working
- Entity extraction operational`,
    labels: ["week-5", "frontend", "backend", "voice", "ai", "high-priority"],
    milestone: "Week 5: Voice & AI",
    assignees: []
  },

  {
    title: "🗣️ Build Voice Command Action System",
    body: `## Description
Implement voice-activated operations for equipment management.

## Acceptance Criteria
- [ ] Equipment status updates via voice
- [ ] Equipment assignment commands
- [ ] Bulk operation commands
- [ ] Search by voice
- [ ] Voice feedback system
- [ ] Command confirmation dialogs

## Technical Requirements
- Command action mapping
- Voice synthesis for feedback
- Confirmation workflows
- Bulk operation processing
- Error handling for voice commands

## Definition of Done
- Voice commands execute actions
- Feedback system working
- Confirmation dialogs functional
- Error handling complete`,
    labels: ["week-5", "backend", "voice", "actions", "high-priority"],
    milestone: "Week 5: Voice & AI",
    assignees: []
  },

  {
    title: "🎯 Create Voice User Interface",
    body: `## Description
Build user interface for voice control with visual feedback.

## Acceptance Criteria
- [ ] Voice control buttons
- [ ] Visual feedback for voice input
- [ ] Voice command history
- [ ] Voice settings panel
- [ ] Accessibility features

## Technical Requirements
- Voice UI components
- Visual feedback animations
- History persistence
- Settings management
- WCAG compliance

## Definition of Done
- Voice UI components ready
- Visual feedback working
- History tracking functional
- Accessibility verified`,
    labels: ["week-5", "frontend", "voice", "ui", "accessibility", "medium-priority"],
    milestone: "Week 5: Voice & AI",
    assignees: []
  },

  // Week 6: Multi-Tenant & School Onboarding
  {
    title: "🏢 Implement Multi-Tenant Architecture",
    body: `## Description
Build multi-tenant architecture with school isolation and management.

## Acceptance Criteria
- [ ] Organization hierarchy implementation
- [ ] School provisioning system
- [ ] Data isolation validation
- [ ] Cross-school reporting
- [ ] Tenant switching interface
- [ ] Resource allocation per school

## Technical Requirements
- Tenant middleware implementation
- Data isolation enforcement
- Hierarchy management
- Cross-tenant reporting
- Resource allocation logic

## Definition of Done
- Multi-tenancy operational
- Data isolation verified
- Provisioning system working
- Cross-school reporting functional`,
    labels: ["week-6", "backend", "multi-tenant", "architecture", "high-priority"],
    milestone: "Week 6: Multi-Tenant",
    assignees: []
  },

  {
    title: "🚀 Build School Onboarding Automation",
    body: `## Description
Create automated school onboarding with website scanning and branding.

## Acceptance Criteria
- [ ] Website scanning system (Puppeteer)
- [ ] Logo extraction and processing
- [ ] Color scheme detection
- [ ] Branding application
- [ ] Sport program templates
- [ ] Equipment category setup

## Technical Requirements
- Puppeteer web scraping
- Image processing for logos
- Color extraction algorithms
- Template system
- Automated setup workflows

## Definition of Done
- Website scanning functional
- Logo extraction working
- Branding automation complete
- Template system operational`,
    labels: ["week-6", "backend", "onboarding", "automation", "high-priority"],
    milestone: "Week 6: Multi-Tenant",
    assignees: []
  },

  {
    title: "📊 Create Bulk Operations System",
    body: `## Description
Implement bulk operations for mass data management and import/export.

## Acceptance Criteria
- [ ] CSV import/export functionality
- [ ] Bulk equipment creation
- [ ] Bulk status updates
- [ ] Data validation for imports
- [ ] Error reporting for failed imports

## Technical Requirements
- CSV processing libraries
- Bulk operation queues
- Data validation pipelines
- Error reporting system
- Progress tracking

## Definition of Done
- Bulk operations working
- Import/export functional
- Validation system complete
- Error reporting operational",
    labels: ["week-6", "backend", "bulk-operations", "import-export", "medium-priority"],
    milestone: "Week 6: Multi-Tenant",
    assignees: []
  },

  // Week 7: Reporting, Analytics & Communication
  {
    title: "📈 Build Reporting & Analytics System",
    body: `## Description
Create comprehensive reporting system with analytics dashboard.

## Acceptance Criteria
- [ ] Dashboard analytics
- [ ] Equipment utilization reports
- [ ] Cost analysis reports
- [ ] Maintenance scheduling reports
- [ ] Custom report builder
- [ ] Report scheduling system

## Technical Requirements
- Chart library integration
- Report generation engine
- Custom query builder
- Scheduling system
- Export capabilities

## Definition of Done
- Analytics dashboard complete
- Report builder functional
- Scheduled reports working
- Export system operational`,
    labels: ["week-7", "frontend", "backend", "reporting", "analytics", "high-priority"],
    milestone: "Week 7: Reporting",
    assignees: []
  },

  {
    title: "📧 Implement Multi-Channel Communication System",
    body: `## Description
Build multi-channel notification system with parent portal access.

## Acceptance Criteria
- [ ] Email notification system
- [ ] SMS integration (Twilio)
- [ ] In-app notifications
- [ ] Parent portal access
- [ ] Equipment responsibility signatures
- [ ] Automated workflow triggers

## Technical Requirements
- Email service integration
- Twilio SMS integration
- Real-time notifications
- Digital signature system
- Workflow automation engine

## Definition of Done
- Multi-channel notifications working
- Parent portal functional
- Digital signatures operational
- Workflows automated",
    labels: ["week-7", "backend", "notifications", "communication", "high-priority"],
    milestone: "Week 7: Reporting",
    assignees: []
  },

  {
    title: "🔮 Develop Advanced Features",
    body: `## Description
Implement advanced features including predictive analytics and compliance tracking.

## Acceptance Criteria
- [ ] Equipment sharing between schools
- [ ] Maintenance prediction algorithms
- [ ] Budget planning tools
- [ ] Compliance tracking
- [ ] Insurance claim preparation

## Technical Requirements
- Cross-tenant sharing logic
- ML prediction models
- Budget calculation algorithms
- Compliance rule engine
- Insurance integration APIs

## Definition of Done
- Sharing system functional
- Predictions operational
- Budget tools working
- Compliance tracking active`,
    labels: ["week-7", "backend", "advanced-features", "ml", "medium-priority"],
    milestone: "Week 7: Reporting",
    assignees: []
  },

  // Week 8: Production Deployment & Launch
  {
    title: "🚀 Setup Production Environment",
    body: `## Description
Configure production server environment with SSL and process management.

## Acceptance Criteria
- [ ] Production server configuration
- [ ] SSL certificate setup (Let's Encrypt)
- [ ] Database migration to production
- [ ] Environment variable configuration
- [ ] PM2 process management setup
- [ ] Nginx reverse proxy configuration

## Technical Requirements
- Server hardening and security
- Automated SSL renewal
- Database migration scripts
- Process monitoring
- Load balancing configuration

## Definition of Done
- Production environment operational
- SSL security active
- Database migrated successfully
- Process management working`,
    labels: ["week-8", "deployment", "production", "infrastructure", "high-priority"],
    milestone: "Week 8: Launch",
    assignees: []
  },

  {
    title: "⚡ Production Performance & Security Optimization",
    body: `## Description
Optimize performance and implement security hardening for production launch.

## Acceptance Criteria
- [ ] Performance optimization
- [ ] Security audit and hardening
- [ ] Load testing
- [ ] Backup system setup
- [ ] Monitoring and alerting
- [ ] Error tracking (Sentry integration)

## Technical Requirements
- Performance profiling
- Security vulnerability scanning
- Load testing with realistic data
- Automated backup system
- Comprehensive monitoring setup

## Definition of Done
- Performance benchmarks met
- Security audit passed
- Load testing successful
- Monitoring system operational`,
    labels: ["week-8", "performance", "security", "monitoring", "high-priority"],
    milestone: "Week 8: Launch",
    assignees: []
  },

  {
    title: "🎯 Launch Preparation & Go-Live",
    body: `## Description
Final launch preparation including testing, documentation, and support setup.

## Acceptance Criteria
- [ ] User acceptance testing
- [ ] Documentation finalization
- [ ] Training materials creation
- [ ] Support system setup
- [ ] Launch checklist completion
- [ ] Rollback procedures

## Technical Requirements
- End-to-end testing suite
- Comprehensive documentation
- Training video creation
- Support ticket system
- Launch automation scripts

## Definition of Done
- UAT completed successfully
- Documentation complete
- Training materials ready
- Support system operational",
    labels: ["week-8", "launch", "documentation", "support", "high-priority"],
    milestone: "Week 8: Launch",
    assignees: []
  }
];

// Milestones for the project
const milestones = [
  {
    title: "Week 1: Foundation",
    description: "Core backend development and authentication system",
    due_date: "2025-01-31"
  },
  {
    title: "Week 2: QR & Transactions", 
    description: "QR code system and transaction tracking",
    due_date: "2025-02-07"
  },
  {
    title: "Week 3: Frontend Core",
    description: "React application and user interface development",
    due_date: "2025-02-14"
  },
  {
    title: "Week 4: Mobile PWA",
    description: "Progressive Web App and mobile optimization",
    due_date: "2025-02-21"
  },
  {
    title: "Week 5: Voice & AI",
    description: "Voice commands and AI integration",
    due_date: "2025-02-28"
  },
  {
    title: "Week 6: Multi-Tenant",
    description: "Multi-tenant architecture and school onboarding",
    due_date: "2025-03-07"
  },
  {
    title: "Week 7: Reporting",
    description: "Analytics, reporting, and communication systems",
    due_date: "2025-03-14"
  },
  {
    title: "Week 8: Launch",
    description: "Production deployment and launch preparation",
    due_date: "2025-03-21"
  }
];

// Create GitHub CLI commands for issues
function generateGitHubCommands() {
  const commands = [];
  
  // Create milestones
  milestones.forEach(milestone => {
    commands.push(`gh api repos/GrimthornRedbeard/etrax/milestones \\
  --method POST \\
  --field title="${milestone.title}" \\
  --field description="${milestone.description}" \\
  --field due_on="${milestone.due_date}T23:59:59Z" \\
  --field state="open"`);
  });
  
  // Create issues
  issues.forEach((issue, index) => {
    const labelsStr = issue.labels.join(',');
    commands.push(`gh issue create \\
  --title "${issue.title}" \\
  --body "${issue.body.replace(/"/g, '\\"').replace(/\n/g, '\\n')}" \\
  --label "${labelsStr}" \\
  --milestone "${issue.milestone}"`);
  });
  
  return commands;
}

// Generate the commands
const commands = generateGitHubCommands();

// Write to shell script
const scriptContent = `#!/bin/bash

# ETrax GitHub Issues Creation Script
# This script creates all milestones and issues for the 8-week development roadmap

set -e

echo "🚀 Creating GitHub milestones and issues for ETrax development roadmap..."

# Check if GitHub CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed. Please install it first:"
    echo "   https://github.com/cli/cli#installation"
    exit 1
fi

# Check if user is authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ You are not authenticated with GitHub CLI. Please run 'gh auth login' first."
    exit 1
fi

echo "✅ GitHub CLI is installed and authenticated"
echo "📝 Creating milestones..."

${commands.slice(0, milestones.length).join('\n\necho "Created milestone"\nsleep 1\n\n')}

echo "📋 Creating issues..."

${commands.slice(milestones.length).join('\n\necho "Created issue"\nsleep 2\n\n')}

echo "🎉 All GitHub issues and milestones created successfully!"
echo "📊 Summary:"
echo "   • Milestones: ${milestones.length}"
echo "   • Issues: ${issues.length}"
echo ""
echo "Visit https://github.com/GrimthornRedbeard/etrax/issues to view all issues"
echo "Visit https://github.com/GrimthornRedbeard/etrax/milestones to view milestones"
`;

// Save the script
fs.writeFileSync(path.join(__dirname, 'create-issues.sh'), scriptContent);

// Also create a JSON file with all the issue data for reference
fs.writeFileSync(path.join(__dirname, 'roadmap-issues.json'), JSON.stringify({
  milestones,
  issues
}, null, 2));

console.log('📝 GitHub issues script created successfully!');
console.log('');
console.log('Files created:');
console.log('  • scripts/create-issues.sh - Shell script to create issues');
console.log('  • scripts/roadmap-issues.json - JSON data for reference');
console.log('');
console.log('To create the issues, run:');
console.log('  chmod +x scripts/create-issues.sh');
console.log('  ./scripts/create-issues.sh');
console.log('');
console.log('📊 Summary:');
console.log(`  • Milestones: ${milestones.length}`);
console.log(`  • Issues: ${issues.length}`);
console.log('  • 8-week development roadmap');
console.log('  • Complete with labels, milestones, and acceptance criteria');