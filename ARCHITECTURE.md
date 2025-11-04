# Architecture Documentation

## System Overview

Pokemon TCG Investment Tracker is a full-stack TypeScript application following modern web development best practices. The system is designed for scalability, maintainability, and performance.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Client Layer                         │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   React UI   │  │    Hooks     │  │   Services   │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP/REST
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway Layer                       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  Rate Limit  │  │  Auth Guard  │  │  Validation  │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Business Logic Layer                     │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Auth Service │  │ Alert Service│  │ Card Service │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Data Access Layer                       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   SQLite DB  │  │  External API│  │   Cache      │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Frontend Architecture

### Component Structure

```
src/
├── components/           # React components
│   ├── ui/              # Reusable UI components
│   ├── features/        # Feature-specific components
│   └── layouts/         # Layout components
├── hooks/               # Custom React hooks
│   ├── useAuth.ts       # Authentication hook
│   ├── usePokemonCards.ts
│   └── useAlerts.ts
├── services/            # API communication layer
│   ├── authService.ts
│   ├── cardService.ts
│   └── alertService.ts
├── utils/               # Utility functions
│   ├── performance.ts   # Performance optimizations
│   └── validation.ts
├── types/               # TypeScript definitions
├── config/              # Configuration files
└── test/                # Test utilities
```

### State Management

The application uses React's built-in state management:
- **Local State**: `useState` for component-specific state
- **Context**: `useContext` for global state (auth, theme)
- **Custom Hooks**: Encapsulate complex state logic

### Data Flow

```
User Action
    ↓
Component Event Handler
    ↓
Service Layer (API call)
    ↓
Backend API
    ↓
Response
    ↓
State Update
    ↓
Component Re-render
```

## Backend Architecture

### Layered Architecture

```
┌──────────────────────────────────────────┐
│            Routes Layer                   │
│  (API endpoints, request handling)        │
└──────────────────────────────────────────┘
                  ↓
┌──────────────────────────────────────────┐
│          Middleware Layer                 │
│  (Auth, Validation, Rate Limiting)        │
└──────────────────────────────────────────┘
                  ↓
┌──────────────────────────────────────────┐
│          Service Layer                    │
│  (Business logic, data processing)        │
└──────────────────────────────────────────┘
                  ↓
┌──────────────────────────────────────────┐
│       Data Access Layer                   │
│  (Database queries, external APIs)        │
└──────────────────────────────────────────┘
```

### Middleware Pipeline

```
Request
    ↓
Security (Helmet, CORS)
    ↓
Rate Limiting
    ↓
Body Parsing
    ↓
Request Logging
    ↓
Authentication (if protected)
    ↓
Validation
    ↓
Route Handler
    ↓
Error Handler
    ↓
Response
```

### Database Schema

```sql
-- Users Table
users (
  id              INTEGER PRIMARY KEY,
  username        TEXT UNIQUE NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  created_at      DATETIME,
  updated_at      DATETIME
)

-- Price Alerts Table
price_alerts (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id),
  card_id         TEXT NOT NULL,
  card_name       TEXT NOT NULL,
  target_price    REAL NOT NULL,
  condition       TEXT CHECK(condition IN ('above', 'below')),
  is_active       BOOLEAN DEFAULT 1,
  created_at      DATETIME,
  triggered_at    DATETIME
)

-- Price History Table
price_history (
  product_id      INTEGER,
  date            TEXT,
  price           REAL,
  sub_type_name   TEXT,
  product_name    TEXT,
  group_name      TEXT,
  source          TEXT DEFAULT 'tcgcsv',
  PRIMARY KEY (product_id, date, sub_type_name)
)
```

## Security Architecture

### Authentication Flow

```
1. User Registration/Login
      ↓
2. Password Hashing (bcrypt)
      ↓
3. JWT Generation
      ↓
4. Token Storage (localStorage)
      ↓
5. Include Token in Requests
      ↓
6. Server Validates Token
      ↓
7. Access Granted/Denied
```

### Security Layers

1. **Transport Security**: HTTPS in production
2. **Authentication**: JWT with configurable expiration
3. **Authorization**: Role-based access control
4. **Input Validation**: Zod schema validation
5. **Rate Limiting**: Prevents brute force attacks
6. **CORS**: Restricts cross-origin requests
7. **Helmet**: Sets security headers
8. **SQL Injection**: Parameterized queries

## API Design

### REST Principles

- Resource-based URLs
- HTTP methods for CRUD operations
- Consistent response format
- Proper status codes
- API versioning ready

### Response Format

```typescript
// Success Response
{
  "data": { ... },
  "message": "Success message",
  "timestamp": "2024-01-01T00:00:00Z"
}

// Error Response
{
  "error": "Error message",
  "details": [ ... ],
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### Pagination

```typescript
{
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

## Performance Optimizations

### Frontend

1. **Code Splitting**: Route-based splitting
2. **Lazy Loading**: Components and images
3. **Memoization**: React.memo, useMemo, useCallback
4. **Debouncing**: Search inputs
5. **Virtual Scrolling**: Large lists
6. **Image Optimization**: Lazy loading, proper formats

### Backend

1. **Database Indexing**: Optimized queries
2. **Response Caching**: 5-minute cache
3. **Connection Pooling**: Efficient DB connections
4. **Compression**: Gzip responses
5. **Rate Limiting**: Prevents overload

## Monitoring & Observability

### Error Tracking

- **Sentry**: Real-time error tracking
- **Source Maps**: Proper error traces
- **User Context**: Identify affected users

### Logging

```typescript
logger.info('User login', { userId, ip });
logger.error('API error', { error, endpoint, method });
logger.warn('Rate limit exceeded', { ip, endpoint });
```

### Metrics

- Request duration
- Error rates
- API usage
- Database query performance

## Deployment Architecture

### Development

```
Developer Machine
    ↓
npm run dev
    ↓
Vite Dev Server (Frontend) + Nodemon (Backend)
```

### Production

```
Git Push
    ↓
GitHub Actions (CI/CD)
    ↓
Build & Test
    ↓
Docker Build
    ↓
Deploy to Cloud
    ↓
CDN (Frontend) + Container (Backend)
```

### Container Architecture

```yaml
services:
  frontend:
    - nginx
    - static files
    - reverse proxy
  
  backend:
    - node.js
    - express
    - SQLite
```

## Scalability Considerations

### Current Scale

- Single server deployment
- SQLite database
- File-based storage

### Future Scale

1. **Database**: Migrate to PostgreSQL
2. **Caching**: Add Redis layer
3. **Load Balancing**: Multiple backend instances
4. **CDN**: Static asset distribution
5. **Microservices**: Split services as needed
6. **Message Queue**: Background job processing

## Development Workflow

```
Feature Branch
    ↓
Local Development
    ↓
Unit Tests
    ↓
Integration Tests
    ↓
Code Review
    ↓
CI Pipeline
    ↓
Merge to Main
    ↓
Deploy to Production
```

## Technology Decisions

### Why TypeScript?
- Type safety
- Better IDE support
- Catch errors at compile time
- Improved documentation

### Why SQLite?
- Zero configuration
- Serverless
- Perfect for MVP
- Easy migration path

### Why JWT?
- Stateless authentication
- Scalable
- Mobile-friendly
- Industry standard

### Why React?
- Component-based
- Large ecosystem
- Excellent tooling
- Strong community

## Best Practices

1. **DRY**: Don't Repeat Yourself
2. **SOLID**: Object-oriented design principles
3. **12-Factor App**: Cloud-native principles
4. **TDD**: Test-Driven Development
5. **Clean Code**: Readable, maintainable code
6. **Documentation**: Keep docs updated

## Future Improvements

1. GraphQL API option
2. Real-time updates (WebSockets)
3. Advanced caching strategies
4. Microservices architecture
5. Machine learning integration
6. Mobile app development

