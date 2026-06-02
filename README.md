# Pokemon TCG Investment Tracker

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)
![Coverage](https://img.shields.io/badge/coverage-85%25-green.svg)

**A professional-grade full-stack application for tracking and analyzing Pokemon TCG card values and investment opportunities.**

[Features](#features) • [Tech Stack](#tech-stack) • [Getting Started](#getting-started) • [API Documentation](#api-documentation) • [Deployment](#deployment)

</div>

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [API Documentation](#api-documentation)
- [Contributing](#contributing)
- [License](#license)

## 🎯 Overview

Pokemon TCG Investment Tracker is a sophisticated full-stack web application designed to help collectors and investors track, analyze, and manage their Pokemon Trading Card Game collections. The platform integrates real-time price data from TCGCSV.com and provides advanced analytics, price alerts, and portfolio management features.

### Why This Project?

- **Real-time Price Tracking**: Live market data from TCGCSV.com
- **Investment Analytics**: Advanced metrics and historical price charts
- **User Authentication**: Secure JWT-based authentication system
- **Price Alerts**: Get notified when cards hit your target prices
- **Professional Development Practices**: CI/CD, testing, Docker, and more

## ✨ Features

### Core Features
- 🔍 **Advanced Card Search**: Powerful search with filtering and sorting
- 📊 **Price History Charts**: Visualize price trends over time
- 💰 **Real-time Pricing**: Live market data from TCGCSV
- 🎴 **Card Collection Vault**: Track your personal collection
- 📦 **Pack Opening Simulator**: Open virtual booster packs
- 📈 **Investment Analytics**: ROI calculations and market insights
- 📷 **Card Scanner**: AI-powered card recognition via camera or image upload (NEW!)

### Premium Features
- 🚨 **Price Alerts**: Custom notifications for price targets
- 👤 **User Authentication**: Secure account system
- 📱 **Responsive Design**: Works on all devices
- 🌙 **Modern UI/UX**: Clean, intuitive interface
- ⚡ **Performance Optimized**: Fast loading and smooth interactions

### Developer Features
- 🧪 **Comprehensive Testing**: Unit and integration tests
- 🐳 **Docker Support**: Containerized deployment
- 🔄 **CI/CD Pipeline**: Automated testing and deployment
- 📚 **API Documentation**: Interactive Swagger docs
- 🔒 **Security Best Practices**: Helmet, CORS, rate limiting
- 📝 **TypeScript**: Full type safety
- 🎨 **Code Quality**: ESLint, Prettier, Husky

## 🛠 Tech Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 5
- **Styling**: Tailwind CSS 3
- **Charts**: Recharts
- **HTTP Client**: Axios
- **Icons**: Lucide React
- **Testing**: Vitest, React Testing Library
- **Error Tracking**: Sentry

### Backend
- **Runtime**: Node.js 20
- **Framework**: Express.js
- **Database**: SQLite3 (with migration support)
- **Authentication**: JWT + bcrypt
- **Validation**: Zod
- **API Docs**: Swagger/OpenAPI
- **Security**: Helmet, CORS, Rate Limiting
- **Logging**: Winston
- **Testing**: Jest, Supertest
- **Error Tracking**: Sentry

### Card Scanner Backend (Python)
- **Framework**: Flask
- **OCR**: EasyOCR
- **Card Recognition**: pokemon-card-recognizer
- **Image Processing**: Pillow
- **CORS**: flask-cors

### DevOps & Tools
- **Containerization**: Docker, Docker Compose
- **CI/CD**: GitHub Actions
- **Code Quality**: ESLint, Prettier
- **Git Hooks**: Husky, lint-staged
- **Dependency Management**: Dependabot
- **Version Control**: Git

## 🏗 Architecture

```
TCGTracker/
├── src/                     # Frontend source
│   ├── components/          # React components
│   ├── features/
│   │   ├── cards/           # Card browsing
│   │   ├── market/          # Price tracking
│   │   ├── vault/           # Collection management
│   │   ├── packs/           # Pack opening
│   │   └── scanner/         # Card scanner (NEW!)
│   ├── hooks/               # Custom React hooks
│   ├── services/            # API services
│   ├── utils/               # Utility functions
│   ├── types/               # TypeScript types
│   └── config/              # Configuration files
│
├── backend/
│   ├── src/
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   ├── middleware/      # Express middleware
│   │   ├── config/          # Configuration
│   │   ├── db/              # Database setup
│   │   └── utils/           # Utility functions
│   └── tests/               # Backend tests
│
├── card-scanner-backend/    # Python Flask backend (NEW!)
│   ├── app.py               # Flask application
│   ├── requirements.txt     # Python dependencies
│   └── temp_uploads/        # Temporary image storage
│
├── .github/
│   └── workflows/           # CI/CD workflows
│
└── docker/                  # Docker configurations
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- Git
- Python 3.8+ (for card scanner feature)
- Docker (optional, for containerized deployment)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/TCGTracker.git
   cd TCGTracker
   ```

2. **Install frontend dependencies**
   ```bash
   npm install
   ```

3. **Install backend dependencies**
   ```bash
   cd backend
   npm install
   ```

4. **Set up environment variables**
   
   Frontend (.env):
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

   Backend (backend/.env):
   ```bash
   cp backend/.env.example backend/.env
   # Edit backend/.env with your configuration
   # IMPORTANT: Set a secure JWT_SECRET (min 32 characters)
   ```

5. **Set up Card Scanner Backend (Optional but Recommended)**
   
   Terminal 1 (Card Scanner - Python):
   ```bash
   cd card-scanner-backend
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   python app.py
   ```

6. **Start the development servers**
   
   Terminal 2 (Backend - Node.js):
   ```bash
   cd backend
   npm run dev
   ```

   Terminal 3 (Frontend - React):
   ```bash
   npm run dev
   ```

7. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001
   - Card Scanner API: http://localhost:5000
   - API Documentation: http://localhost:3001/api-docs

**Note**: The Card Scanner feature requires the Python backend to be running. See [README_CARD_SCANNER.md](./README_CARD_SCANNER.md) for detailed setup instructions.

## 💻 Development

### Code Quality

```bash
# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check

# Type check
npm run type-check
```

### Git Hooks

Pre-commit hooks automatically run:
- Linting
- Formatting
- Type checking

To install hooks:
```bash
npm run prepare
```

## 🧪 Testing

### Frontend Tests

```bash
# Run tests
npm test

# Run tests with UI
npm run test:ui

# Generate coverage report
npm run test:coverage

# Run tests once (CI mode)
npm run test:run
```

### Backend Tests

```bash
cd backend

# Run tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Test Coverage Goals
- Frontend: 80%+
- Backend: 85%+
- Critical paths: 100%

## 🐳 Docker Deployment

### Development with Docker Compose

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Production Build

```bash
# Build frontend image
docker build -t tcgtracker-frontend .

# Build backend image
docker build -t tcgtracker-backend ./backend

# Run containers
docker run -p 80:80 tcgtracker-frontend
docker run -p 3001:3001 tcgtracker-backend
```

## 📚 API Documentation

### Interactive Documentation

Access the interactive Swagger UI at: http://localhost:3001/api-docs

### Key Endpoints

#### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/update` - Update profile
- `POST /api/auth/change-password` - Change password

#### Price Alerts
- `GET /api/alerts` - Get user's alerts
- `POST /api/alerts` - Create new alert
- `PUT /api/alerts/:id/toggle` - Toggle alert status
- `DELETE /api/alerts/:id` - Delete alert

#### Cards & Prices
- `GET /api/cards/search` - Search cards
- `GET /api/prices/:cardId` - Get price history
- `GET /api/cards/sets` - Get all sets

### Authentication

Protected endpoints require JWT token in Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## 🔒 Security Features

- **JWT Authentication**: Secure token-based auth
- **Password Hashing**: bcrypt with configurable rounds
- **Rate Limiting**: Prevents abuse
  - API: 100 requests per 15 minutes
  - Auth: 5 attempts per 15 minutes
- **CORS**: Configured for specific origins
- **Helmet**: Security headers
- **Input Validation**: Zod schema validation
- **SQL Injection Protection**: Parameterized queries
- **XSS Protection**: Sanitized inputs

## 📊 Performance Optimizations

- **Code Splitting**: Lazy-loaded routes
- **Image Optimization**: Lazy loading with intersection observer
- **Memoization**: Cached expensive calculations
- **Debouncing**: Optimized search inputs
- **Virtual Scrolling**: Efficient large lists
- **Response Caching**: 5-minute API cache
- **Compression**: Gzip enabled
- **CDN Ready**: Static asset optimization

## 🚢 Deployment

### Recommended Platforms

**Frontend**:
- Vercel (Recommended)
- Netlify
- AWS S3 + CloudFront

**Backend**:
- Railway (Recommended)
- Heroku
- AWS ECS/Fargate
- DigitalOcean App Platform

### Environment Variables (Production)

**Frontend**:
```env
VITE_API_URL=https://api.yourdomain.com
VITE_SENTRY_DSN=your-sentry-dsn
VITE_SENTRY_ENVIRONMENT=production
```

**Backend**:
```env
NODE_ENV=production
JWT_SECRET=your-super-secure-secret-min-32-chars
DATABASE_PATH=/path/to/production/database.db
CORS_ORIGIN=https://yourdomain.com
SENTRY_DSN=your-backend-sentry-dsn
CLOUD_SYNC_ENABLED=true
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_BUCKET=tcgtracker-data
```

Cloud backup notes:
- When `CLOUD_SYNC_ENABLED=true`, every successful price sync uploads:
  - `backups/tcg-prices-YYYY-MM-DD.db`
  - `latest/tcg-prices-latest.db`
  - metadata JSON under `metadata/`
- Manual endpoints:
  - `POST /api/cloud-backup`
  - `GET /api/cloud-backup/status`

### CI/CD Pipeline

The project includes GitHub Actions workflows for:
- ✅ Automated testing
- ✅ Linting and formatting checks
- ✅ Type checking
- ✅ Docker image builds
- ✅ Security scanning
- ✅ Automatic deployment (when configured)

## 📈 Monitoring & Analytics

### Error Tracking
- **Sentry** integration for both frontend and backend
- Real-time error notifications
- Performance monitoring
- Session replay

### Logging
- Winston logger for backend
- Structured JSON logs
- Log rotation
- Different log levels per environment

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Write tests for new features
- Follow existing code style
- Update documentation
- Keep commits atomic and descriptive

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👤 Author

**Your Name**
- GitHub: [@yourusername](https://github.com/yourusername)
- LinkedIn: [Your Name](https://linkedin.com/in/yourprofile)
- Email: your.email@example.com

## 🙏 Acknowledgments

- [Pokemon TCG API](https://pokemontcg.io/) for card data
- [TCGCSV.com](https://tcgcsv.com/) for price data
- All open-source libraries used in this project

## 🗺 Roadmap

- [x] **Card Scanner** with AI recognition (COMPLETED!)
- [ ] Real-time video streaming for card detection
- [ ] Mobile app (React Native)
- [ ] Advanced portfolio analytics
- [ ] Social features (share collections)
- [ ] Machine learning price predictions
- [ ] Multi-currency support
- [ ] Export to Excel/PDF
- [ ] Trade marketplace
- [ ] Wishlist feature
- [ ] Batch card scanning
- [ ] Card condition/grading detection

---

<div align="center">

**⭐ Star this repository if you find it helpful! ⭐**

Made with ❤️ and TypeScript

</div>
