# Pokemon Card Scanner Integration Guide

This guide explains how to integrate the Python-based pokemon-card-recognizer into your JavaScript/React TCGTracker application.

## Architecture Overview

The integration uses a **Python Flask backend** as a bridge between the React frontend and the Python card recognizer:

```
React Frontend (JS/TS)
        ↓ HTTP REST API
Flask Backend (Python)
        ↓ Direct Python Import
Pokemon Card Recognizer (Python)
```

## Components

### 1. Backend (Python Flask)
- **Location**: `card-scanner-backend/`
- **Purpose**: Wraps the pokemon-card-recognizer library and exposes REST API endpoints
- **Key Files**:
  - `app.py` - Flask server with API endpoints
  - `requirements.txt` - Python dependencies

### 2. Frontend Service
- **Location**: `src/services/cardScannerApi.ts`
- **Purpose**: TypeScript service to communicate with Flask backend
- **Functions**:
  - `scanCardFromFile()` - Upload and scan image file
  - `scanCardFromBase64()` - Scan from camera capture
  - `checkBackendHealth()` - Check if backend is running

### 3. React Component
- **Location**: `src/features/scanner/components/CardScanner.tsx`
- **Purpose**: UI component for card scanning
- **Features**:
  - Real-time camera scanning
  - Image upload scanning
  - Result display with confidence scores

## Setup Instructions

### Step 1: Set Up Python Backend

1. Navigate to the backend directory:
   ```bash
   cd card-scanner-backend
   ```

2. Create and activate a Python virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

   This will install:
   - Flask (web framework)
   - flask-cors (CORS support)
   - pillow (image processing)
   - pokemon-card-recognizer (card recognition)

4. Start the Flask server:
   ```bash
   python app.py
   ```

   The server will run on `http://localhost:5000`

### Step 2: Configure React Frontend

1. Create a `.env` file in the TCGTracker root (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

2. Set the backend URL in `.env`:
   ```
   VITE_CARD_SCANNER_API_URL=http://localhost:5000
   ```

3. Install any new frontend dependencies (if needed):
   ```bash
   npm install
   ```

### Step 3: Run the Application

1. Start the React development server:
   ```bash
   npm run dev
   ```

2. Open your browser and navigate to the app (usually `http://localhost:5173`)

3. Click "Card Scanner" in the navigation menu

## API Endpoints

### Health Check
```
GET /health
```
Returns backend status

### Scan Card
```
POST /api/scan-card
```

**Request (File Upload)**:
```
Content-Type: multipart/form-data
Body: image=<file>
```

**Request (Base64)**:
```
Content-Type: application/json
Body: { "image": "data:image/jpeg;base64,..." }
```

**Response**:
```json
{
  "success": true,
  "card": {
    "name": "Pikachu",
    "set": "Base Set",
    "number": "25",
    "confidence": 0.95,
    "id": "base1-25"
  }
}
```

### Get Available Sets
```
GET /api/available-sets
```
Returns list of all Pokemon card sets supported by the recognizer

## Usage

### Camera Scanning
1. Click "Card Scanner" in navigation
2. Select "Real-Time Camera"
3. Allow camera permissions
4. Hold card in front of camera
5. Click "Capture & Scan"

### Image Upload
1. Click "Card Scanner" in navigation
2. Select "Upload Image"
3. Choose an image file
4. View results

## How It Works

### Card Recognition Process

1. **Image Capture/Upload**: User provides an image via camera or file upload
2. **API Request**: Frontend sends image to Flask backend
3. **OCR Processing**: Backend uses EasyOCR to extract text from card
4. **Classification**: Extracted text is matched against card database using word classification
5. **Response**: Backend returns card details with confidence score
6. **Display**: Frontend shows recognized card information

### Key Technologies

**Backend**:
- **Flask**: Lightweight Python web framework
- **EasyOCR**: Optical Character Recognition for text extraction
- **pokemon-card-recognizer**: Card identification library with pre-built card database

**Frontend**:
- **React**: UI framework
- **TypeScript**: Type-safe JavaScript
- **Axios**: HTTP client for API requests
- **MediaDevices API**: Browser camera access

## Troubleshooting

### Backend Not Starting

**Problem**: Backend fails to start
**Solutions**:
- Ensure Python 3.8+ is installed
- Check all dependencies are installed: `pip list`
- Look for error messages in terminal
- Try: `pip install --upgrade pokemon-card-recognizer`

### Camera Not Working

**Problem**: Camera doesn't activate
**Solutions**:
- Check browser permissions (usually top-left of address bar)
- Try different browser (Chrome/Edge recommended)
- Ensure HTTPS or localhost (camera requires secure context)
- Check if camera is being used by another application

### Backend Unavailable Error

**Problem**: Frontend shows "Backend Unavailable"
**Solutions**:
- Verify backend is running: `curl http://localhost:5000/health`
- Check `.env` has correct `VITE_CARD_SCANNER_API_URL`
- Ensure no firewall blocking port 5000
- Try restarting backend server

### Low Confidence Scores

**Problem**: Card detection has low confidence
**Solutions**:
- Ensure good lighting
- Hold card flat and straight
- Fill frame with card (not too far/close)
- Avoid glare on card surface
- Use high-resolution images

### CORS Errors

**Problem**: Browser shows CORS error
**Solutions**:
- Backend has flask-cors enabled by default
- Check backend logs for CORS errors
- Ensure frontend URL matches CORS settings
- Try clearing browser cache

## Performance Notes

- **GPU Acceleration**: Card recognizer runs 5-10x faster with NVIDIA GPU
- **First Request**: First scan may be slower due to model loading
- **Subsequent Scans**: Cached models make follow-up scans faster
- **Image Size**: Larger images take longer to process

## Card Set Support

The recognizer uses the "master" set by default, which includes all Pokemon cards across all sets. You can query available sets via:

```typescript
import { getAvailableSets } from './services/cardScannerApi';

const sets = await getAvailableSets();
console.log(sets);
```

## Future Enhancements

Possible improvements to consider:

1. **Real-time Streaming**: Process video frames continuously without manual capture
2. **Batch Scanning**: Upload multiple images at once
3. **Card Price Integration**: Fetch prices for detected cards
4. **Add to Vault**: Automatically add scanned cards to collection
5. **Set Filtering**: Let users specify which set to search within
6. **Mobile App**: Build native mobile app with better camera integration
7. **WebSocket Support**: Real-time scanning feedback
8. **Card Grading Detection**: Identify card condition/grading

## Security Considerations

- Backend accepts image uploads - consider file size limits
- No authentication required currently - add if deploying publicly
- CORS enabled for all origins - restrict in production
- Temporary files cleaned up after processing
- Consider rate limiting for production deployment

## Deployment

### Backend Deployment Options

1. **Docker**: Create Dockerfile for easy deployment
2. **AWS Lambda**: Serverless deployment (note: slower cold starts)
3. **Google Cloud Run**: Containerized deployment with auto-scaling
4. **Heroku**: Simple platform deployment
5. **DigitalOcean**: VPS deployment

### Frontend Deployment

- Deploy as normal React app (Vercel, Netlify, etc.)
- Update `VITE_CARD_SCANNER_API_URL` to production backend URL
- Ensure backend allows CORS from production frontend domain

## License

Ensure compliance with pokemon-card-recognizer license and Pokemon Company guidelines.

## Support

For issues:
- Check this guide first
- Review pokemon-card-recognizer documentation
- Check browser console for errors
- Review Flask backend logs
