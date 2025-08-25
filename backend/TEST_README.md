# ETrax Backend Testing Infrastructure

This document describes the comprehensive testing infrastructure for the ETrax backend application.

## Testing Stack

- **Test Framework**: [Vitest](https://vitest.dev/) - Fast, modern test runner
- **Integration Testing**: [Supertest](https://github.com/ladjs/supertest) - HTTP assertions
- **Database**: PostgreSQL with isolated test database
- **Mocking**: Vitest built-in mocking capabilities
- **Coverage**: v8 coverage provider
- **CI/CD**: GitHub Actions with automated testing

## Test Structure

```
src/tests/
├── setup.ts              # Global test setup and utilities
├── utils.ts               # Test helper functions and utilities
├── auth.test.ts           # Authentication service tests
├── equipment.test.ts      # Equipment service tests
├── category.test.ts       # Category service tests
├── location.test.ts       # Location service tests
├── user.test.ts           # User service tests
└── integration/
    └── api.test.ts        # Full API integration tests
```

## Test Types

### 1. Unit Tests
Test individual functions and services in isolation with mocked dependencies.

**Files**: `*.test.ts` (excluding integration folder)
**Command**: `npm run test:unit`

### 2. Integration Tests
Test complete API endpoints with real database interactions.

**Files**: `integration/*.test.ts`
**Command**: `npm run test:integration`

### 3. Coverage Tests
Generate comprehensive test coverage reports.

**Command**: `npm run test:coverage`

## Running Tests

### Prerequisites

1. **PostgreSQL** running on `localhost:5432`
2. **Redis** running on `localhost:6379`
3. **Test database** created: `etrax_test`

```bash
# Create test database (run once)
createdb etrax_test -U postgres

# Install dependencies
npm install
```

### Test Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage report
npm run test:coverage

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Setup test database
npm run test:setup

# Reset test database
npm run db:test:reset
```

## Test Configuration

### Environment Variables

Tests use `.env.test` file with isolated configuration:

```bash
NODE_ENV=test
DATABASE_URL=postgresql://test:test@localhost:5432/etrax_test?schema=public
JWT_SECRET=test-jwt-secret-key-for-testing-only-min-32-chars
REDIS_URL=redis://localhost:6379/1
```

### Vitest Configuration

See `vitest.config.ts` for detailed configuration including:

- **Path aliases**: `@/` maps to `./src/`
- **Coverage thresholds**: 80% minimum across all metrics
- **Test timeouts**: 30 seconds for complex operations
- **Sequential execution**: Ensures database consistency

## Test Utilities

### Mock Data Creation

```typescript
import { createTestUser, createTestEquipment } from './setup';

// Create test user
const user = await createTestUser({ 
  role: 'ADMIN', 
  email: 'admin@test.com' 
});

// Create test equipment
const equipment = await createTestEquipment(categoryId, locationId);
```

### API Testing Helpers

```typescript
import { generateTestToken, assertUserResponse } from './utils';

// Generate JWT token for testing
const token = generateTestToken({ userId: 'test-id', role: 'ADMIN' });

// Assert API response structure
assertUserResponse(response.body.user);
```

### Database Testing

```typescript
import { testPrisma, cleanDatabase } from './setup';

// Clean database before each test
beforeEach(async () => {
  await cleanDatabase();
});

// Direct database operations in tests
const user = await testPrisma.user.create({
  data: { email: 'test@example.com', ... }
});
```

## Mocking Strategy

### External Services

- **Email service**: Mocked to prevent actual email sending
- **Redis**: In-memory mock with full API compatibility
- **QR code generation**: Returns mock base64 data
- **File uploads**: Simulated with buffer data

### Database Mocking

Tests can run in two modes:

1. **Real Database**: Full integration with PostgreSQL (preferred)
2. **Mock Database**: Fallback when database is unavailable

### Authentication Mocking

```typescript
// Mock bcrypt for consistent password testing
vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('$2a$10$mock.hashed.password'),
  compare: vi.fn().mockImplementation((password) => {
    return Promise.resolve(password === 'Test123!@#');
  }),
}));
```

## Coverage Requirements

All code must meet minimum coverage thresholds:

- **Branches**: 80%
- **Functions**: 80% 
- **Lines**: 80%
- **Statements**: 80%

### Coverage Reports

```bash
# Generate HTML coverage report
npm run test:coverage

# View coverage report
open coverage/index.html
```

## Continuous Integration

### GitHub Actions

`.github/workflows/test.yml` provides:

- **Automated testing** on push/PR
- **Multiple Node.js versions** (currently 23.x)
- **Database services** (PostgreSQL 17, Redis 7)
- **Security scanning** with npm audit and Snyk
- **Coverage reporting** to Codecov

### Pipeline Steps

1. **Setup** - Install dependencies, setup services
2. **Database** - Apply migrations, generate Prisma client
3. **Linting** - ESLint and TypeScript checking
4. **Testing** - Run all test suites with coverage
5. **Security** - Vulnerability scanning
6. **Build** - Verify production build works

## Best Practices

### Test Organization

```typescript
describe('Service Name', () => {
  describe('Function Group', () => {
    it('should do something specific', async () => {
      // Arrange
      const testData = { ... };
      
      // Act  
      const result = await serviceFunction(testData);
      
      // Assert
      expect(result).toHaveProperty('expectedField');
    });
  });
});
```

### Mock Management

```typescript
beforeEach(() => {
  // Clear all mocks before each test
  vi.clearAllMocks();
  
  // Reset mock implementations
  mockPrisma.user.findMany.mockResolvedValue([]);
});
```

### Database Testing

```typescript
// Always clean up after tests
afterEach(async () => {
  await testPrisma.user.deleteMany({});
});

// Use transactions for complex test scenarios
await testPrisma.$transaction(async (tx) => {
  // Multiple related operations
});
```

### Error Testing

```typescript
// Test validation errors
await expect(
  createUser(invalidData)
).rejects.toThrow('Validation error message');

// Test API errors with specific status codes
const response = await request(app)
  .post('/api/users')
  .send(invalidData);

expect(response.status).toBe(400);
expect(response.body).toHaveProperty('message');
```

## Debugging Tests

### VSCode Configuration

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Tests",
  "program": "${workspaceFolder}/node_modules/vitest/vitest.mjs",
  "args": ["run", "--reporter=verbose"],
  "console": "integratedTerminal",
  "env": {
    "NODE_ENV": "test"
  }
}
```

### Debug Commands

```bash
# Run specific test file
npx vitest run src/tests/user.test.ts

# Run tests matching pattern
npx vitest run --grep "should create user"

# Debug with verbose output
npx vitest run --reporter=verbose

# Run tests in UI mode
npx vitest --ui
```

## Performance Testing

### Execution Time Testing

```typescript
import { expectExecutionTime } from './utils';

it('should complete within acceptable time', async () => {
  await expectExecutionTime(async () => {
    return await expensiveOperation();
  }, 1000); // Max 1 second
});
```

### Database Performance

```typescript
// Test query performance
const start = Date.now();
const result = await testPrisma.equipment.findMany({
  include: { category: true, location: true }
});
const duration = Date.now() - start;

expect(duration).toBeLessThan(500); // Max 500ms
```

## Troubleshooting

### Common Issues

1. **Database Connection**: Ensure PostgreSQL is running and test DB exists
2. **Redis Connection**: Verify Redis is running on port 6379
3. **Permission Issues**: Check file permissions for test uploads
4. **Memory Leaks**: Use `--no-coverage` flag for faster runs during development

### Debug Environment

```bash
# Enable debug logging
DEBUG=* npm test

# Run with Node.js inspector
node --inspect node_modules/.bin/vitest

# Check database connections
npx prisma db pull --schema=./prisma/schema.prisma
```

This testing infrastructure ensures high code quality, comprehensive coverage, and reliable continuous integration for the ETrax backend application.