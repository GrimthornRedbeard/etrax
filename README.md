# ETrax - Sports Equipment Inventory Management System

## Overview

ETrax is a comprehensive multi-tenant SaaS platform for managing sports equipment inventory in educational institutions. Built with modern web technologies, it features QR code tracking, voice input, offline capabilities, and a mobile-first PWA design.

## Key Features

- 🏷️ **QR Code Tracking**: Generate, scan, and manage equipment with QR codes
- 🎤 **Voice Commands**: Natural language processing for hands-free operation
- 📱 **Mobile PWA**: Offline-first Progressive Web App with background sync
- 🏫 **Multi-Tenant**: Isolated school instances with hierarchical reporting
- 🔄 **Bulk Operations**: Efficient end-of-season equipment management
- 📊 **Analytics**: Predictive maintenance and lifecycle cost analysis
- 🔐 **Security**: FERPA/GDPR compliant with enterprise-grade security

## Tech Stack

- **Backend**: Node.js 23.5 + Express + TypeScript + Prisma + PostgreSQL
- **Frontend**: React 18 + Vite 6 + TypeScript + Tailwind CSS
- **Database**: PostgreSQL 17.2 + Redis 7.4.1
- **Infrastructure**: Docker + PM2 + Nginx
- **Testing**: Vitest + Playwright + Supertest
- **CI/CD**: GitHub Actions + Automated Deployments

## Quick Start

### Prerequisites

- Node.js 23.5.0 or higher
- Docker and Docker Compose
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/GrimthornRedbeard/etrax.git
cd etrax
```

2. Run the setup script:
```bash
npm run setup
```

3. Start the development environment:
```bash
npm run docker:up  # Start PostgreSQL and Redis
npm run dev        # Start frontend and backend
```

4. Access the application:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- API Documentation: http://localhost:3000/api-docs

### Development Commands

```bash
# Development
npm run dev              # Start both frontend and backend
npm run dev:backend      # Start backend only
npm run dev:frontend     # Start frontend only

# Database
npm run db:migrate       # Run database migrations
npm run db:seed          # Seed database with test data
npm run db:studio        # Open Prisma Studio

# Testing
npm run test             # Run all tests
npm run test:e2e         # Run end-to-end tests
npm run test:coverage    # Generate coverage report

# Code Quality
npm run lint             # Run ESLint
npm run format           # Format code with Prettier
npm run typecheck        # Run TypeScript checks

# Docker
npm run docker:up        # Start Docker services
npm run docker:down      # Stop Docker services
npm run docker:logs      # View Docker logs

# Deployment
npm run deploy           # Deploy to production
```

## Project Structure

```
etrax/
├── backend/             # Node.js Express API
│   ├── src/
│   │   ├── controllers/ # Request handlers
│   │   ├── services/    # Business logic
│   │   ├── models/      # Prisma models
│   │   ├── middleware/  # Express middleware
│   │   ├── utils/       # Utilities
│   │   └── index.ts     # Entry point
│   ├── prisma/          # Database schema and migrations
│   ├── tests/           # Backend tests
│   └── package.json
├── frontend/            # React Vite application
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Page components
│   │   ├── hooks/       # Custom hooks
│   │   ├── services/    # API services
│   │   ├── stores/      # State management
│   │   ├── utils/       # Utilities
│   │   └── main.tsx     # Entry point
│   ├── public/          # Static assets
│   ├── tests/           # Frontend tests
│   └── package.json
├── shared/              # Shared types and utilities
│   ├── src/
│   │   ├── types/       # TypeScript types
│   │   └── utils/       # Shared utilities
│   └── package.json
├── docs/                # Documentation
│   ├── FEATURES.md      # Feature specifications
│   ├── ARCHITECTURE.md  # System architecture
│   ├── API.md           # API documentation
│   └── ...
├── scripts/             # Build and deployment scripts
├── .github/             # GitHub Actions workflows
├── docker-compose.yml   # Docker configuration
└── package.json         # Root package.json
```

## Documentation

- [Features Documentation](./docs/FEATURES.md)
- [Architecture Overview](./docs/ARCHITECTURE.md)
- [API Documentation](./docs/API.md)
- [Deployment Guide](./docs/DEPLOYMENT.md)
- [Development Roadmap](./docs/DEVELOPMENT-ROADMAP.md)

## Environment Variables

Copy the example environment files:
```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Key environment variables:
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `JWT_SECRET`: Secret for JWT tokens
- `NODE_ENV`: Environment (development/production)

## Testing

The project includes comprehensive testing:

- **Unit Tests**: Component and function testing with Vitest
- **Integration Tests**: API endpoint testing with Supertest
- **E2E Tests**: User flow testing with Playwright
- **PWA Tests**: Offline and sync testing

Run tests with:
```bash
npm run test           # All tests
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
```

## Deployment

### Production Server

The application is configured for deployment to:
- Server: 74.208.111.202 (etrax.app)
- User: etrax
- Directory: /var/www/vhosts/etrax/etrax/

### Deployment Process

1. Ensure all tests pass:
```bash
npm run test
```

2. Build the application:
```bash
npm run build
```

3. Deploy to production:
```bash
npm run deploy
```

The deployment script will:
- Run pre-deployment checks
- Build optimized production bundles
- Upload files via SSH
- Run database migrations
- Restart PM2 processes
- Verify deployment health

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Security

- All data encrypted at rest and in transit
- FERPA/GDPR compliant data handling
- Regular security audits
- Automated dependency updates
- Rate limiting and DDoS protection

## Support

For support, please:
- Check the [documentation](./docs/)
- Open an [issue](https://github.com/GrimthornRedbeard/etrax/issues)
- Contact the development team

## License

This project is proprietary software. All rights reserved.

---

Built with ❤️ for educational institutions worldwide