# Card Scanner Integration

This document provides a quick start guide for the Pokemon Card Scanner feature integrated into TCGTracker.

## Quick Start

### 1. Start the Python Backend

```bash
# Navigate to backend directory
cd card-scanner-backend

# Create virtual environment (first time only)
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies (first time only)
pip install -r requirements.txt

# Start the server
python app.py
```

The backend will run on `http://localhost:5000`

### 2. Configure Frontend

```bash
# In TCGTracker root directory
# Copy environment variables
cp .env.example .env

# Edit .env and ensure this line is present:
# VITE_CARD_SCANNER_API_URL=http://localhost:5000
```

### 3. Start Frontend

```bash
# In TCGTracker root directory
npm run dev
```

### 4. Use the Scanner

1. Open your browser to the app (usually `http://localhost:5173`)
2. Click "Card Scanner" in the navigation
3. Choose either:
   - **Real-Time Camera**: Use your device camera to scan cards live
   - **Upload Image**: Upload a photo of your card

## Features

### Camera Mode
- Real-time camera access
- Capture and scan with one click
- Best for scanning physical cards you have on hand
- Works on mobile devices (requires HTTPS or localhost)

### Upload Mode
- Upload existing photos
- Drag and drop support
- Supports JPG, PNG, GIF formats
- Best for scanning cards from existing photos

### Detection Results
- Card name
- Set name
- Card number
- Confidence score (accuracy of detection)
- Card ID for database lookups

## Requirements

### Backend Requirements
- Python 3.8 or higher
- pip (Python package manager)
- Recommended: NVIDIA GPU with CUDA for faster processing (5-10x speedup)

### Frontend Requirements
- Node.js 16+ and npm
- Modern browser with camera access (Chrome, Firefox, Safari, Edge)
- HTTPS connection or localhost (required for camera access)

## How It Works

1. **Image Input**: User provides card image via camera or upload
2. **Backend Processing**: Flask server receives image
3. **OCR Extraction**: EasyOCR extracts text from card
4. **Card Matching**: Text is matched against Pokemon card database
5. **Results**: Card details returned with confidence score

## Troubleshooting

### "Backend Unavailable" Error
- Make sure Python backend is running (`python app.py`)
- Check that port 5000 is not blocked
- Verify `.env` has correct backend URL

### Camera Not Working
- Grant camera permissions in browser
- Ensure you're on HTTPS or localhost
- Try a different browser (Chrome recommended)
- Check no other app is using the camera

### Low Detection Accuracy
- Ensure good lighting
- Hold card flat and centered
- Avoid glare on card surface
- Make sure card text is clearly visible

## For More Details

See [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) for:
- Complete architecture explanation
- API documentation
- Deployment guide
- Advanced troubleshooting
- Performance optimization tips

## Tech Stack

**Backend:**
- Flask (Python web framework)
- pokemon-card-recognizer (card detection library)
- EasyOCR (text recognition)
- Pillow (image processing)

**Frontend:**
- React + TypeScript
- Axios (HTTP client)
- MediaDevices API (camera access)
- Tailwind CSS (styling)
