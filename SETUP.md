# Setup Guide

Complete setup instructions for Pokemon TCG Investment Tracker.

## Quick Start (5 minutes)

### 1. Prerequisites Check

```bash
node --version  # Should be 18.x or higher
npm --version   # Should be 9.x or higher
git --version   # Any recent version
```

### 2. Clone and Install

```bash
# Clone repository
git clone <your-repo-url> TCGTracker
cd TCGTracker

# Install dependencies
npm install

# Backend dependencies
cd backend
npm install
cd ..
```

### 3. Environment Setup

**Frontend (.env)** - Already created! ✅
```bash
VITE_API_URL=http://localhost:3001
```

**Backend (backend/.env)** - Already created! ✅
```bash
# JWT_SECRET is already set with a secure value
# All required configurations are ready
```

### 4. Start Development Servers

**Terminal 1 (Backend)**:
```bash
cd backend
npm run dev
```

**Terminal 2 (Frontend)**:
```bash
npm run dev
```

### 5. Access Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **API Docs**: http://localhost:3001/api-docs

## Testing Your Setup

Run these commands to verify everything works:

```bash
# Frontend tests
npm test

# Backend tests
cd backend
npm test

# Code quality
npm run lint
npm run type-check
```

## Docker Setup (Optional)

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Troubleshooting

### Port Already in Use

```bash
# Kill process on port 3001 (backend)
lsof -ti:3001 | xargs kill -9

# Kill process on port 5173 (frontend)
lsof -ti:5173 | xargs kill -9
```

### Environment Variable Issues

If you see JWT_SECRET errors, ensure backend/.env has:
```bash
JWT_SECRET=f36dc5ace386cb0334a3be2f24706ce2d7ba43af2126762e6197297c19f35db9
```

### Database Issues

```bash
# Delete and recreate database
rm backend/tcg-prices.db
# Restart backend - migrations will run automatically
```

## Next Steps

1. ✅ Create a user account via the API
2. ✅ Explore the API documentation at http://localhost:3001/api-docs
3. ✅ Search for Pokemon cards
4. ✅ Set up price alerts
5. ✅ Build your collection

## Common Commands

```bash
# Development
npm run dev                 # Start frontend
cd backend && npm run dev   # Start backend

# Testing
npm test                    # Frontend tests
npm run test:coverage       # With coverage
cd backend && npm test      # Backend tests

# Code Quality
npm run lint                # Lint code
npm run format              # Format code
npm run type-check          # Type check

# Build for Production
npm run build               # Frontend
cd backend && npm run build # Backend
```

## Production Deployment

See [README.md](./README.md) for detailed deployment instructions to:
- Vercel (Frontend)
- Railway (Backend)
- Docker (Full stack)

---

**Need help?** Check out:
- [README.md](./README.md) - Complete documentation
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guide

