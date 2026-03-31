# 🚀 Quick Start: Pokemon Card Scanner

## TL;DR - Get Scanning in 3 Steps

### 1️⃣ Start Backend (Terminal 1)
```bash
cd card-scanner-backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

### 2️⃣ Start Frontend (Terminal 2)
```bash
cd /Users/prayugsigdel/Coding/TCGTracker
npm run dev
```

### 3️⃣ Open & Scan
- Open: http://localhost:5173
- Click: "Card Scanner" in navigation
- Choose: Camera or Upload
- Scan! 🎉

---

## What Was Created?

### ✅ Backend API (Python Flask)
```
card-scanner-backend/
├── app.py              ← Flask server with REST API
├── requirements.txt    ← Python dependencies
└── README.md          ← Backend documentation
```

**Endpoints Created:**
- `POST /api/scan-card` - Scan a card image
- `GET /health` - Check backend status
- `GET /api/available-sets` - Get card sets

### ✅ Frontend Integration (React/TypeScript)
```
src/
├── services/
│   └── cardScannerApi.ts              ← API client
└── features/
    └── scanner/
        └── components/
            └── CardScanner.tsx        ← Scanner UI
```

**Updated Files:**
- `src/App.tsx` - Added scanner route
- `src/types/ui.ts` - Added 'scanner' type
- `src/components/layout/Header.tsx` - Added nav link
- `.env.example` - Added backend URL config

### ✅ Documentation
- `README.md` - Updated main README
- `README_CARD_SCANNER.md` - Quick guide
- `INTEGRATION_GUIDE.md` - Detailed docs
- `CARD_SCANNER_IMPLEMENTATION.md` - Complete implementation details

---

## 📸 Features

### Real-Time Camera Mode
- ✅ Live video feed from your device camera
- ✅ One-click capture and scan
- ✅ Works on mobile and desktop
- ✅ Instant card identification

### Upload Mode
- ✅ Upload photos from your device
- ✅ Drag-and-drop support
- ✅ Supports JPG, PNG, GIF
- ✅ Perfect for existing photos

### Results Display
- ✅ Card name, set, and number
- ✅ Confidence score (accuracy)
- ✅ Beautiful animated UI
- ✅ Error handling with helpful messages

---

## 🔧 Tech Stack

**Backend:**
- Flask (Python web server)
- pokemon-card-recognizer (AI card detection)
- EasyOCR (text extraction from images)
- Pillow (image processing)

**Frontend:**
- React + TypeScript
- Axios (HTTP requests)
- MediaDevices API (camera access)
- Tailwind CSS (styling)

---

## ⚡ Quick Commands

### Backend Commands
```bash
# Navigate to backend
cd card-scanner-backend

# Activate virtual environment
source venv/bin/activate    # Mac/Linux
venv\Scripts\activate       # Windows

# Install/Update dependencies
pip install -r requirements.txt

# Start server
python app.py

# Test health endpoint
curl http://localhost:5000/health
```

### Frontend Commands
```bash
# Navigate to project root
cd /Users/prayugsigdel/Coding/TCGTracker

# Install dependencies (first time)
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

---

## 🐛 Common Issues & Fixes

### "Backend Unavailable"
**Problem:** Frontend can't connect to backend

**Fix:**
```bash
# 1. Check backend is running
curl http://localhost:5001/health

# 2. Check .env has correct URL
cat .env | grep CARD_SCANNER

# 3. Restart backend
cd card-scanner-backend
python app.py
```

### "Module not found" (Python)
**Problem:** Missing Python dependencies

**Fix:**
```bash
# Make sure virtual environment is activated
source venv/bin/activate

# Reinstall dependencies
pip install -r requirements.txt
```

### Camera Not Working
**Problem:** Browser can't access camera

**Fix:**
- Click "Allow" when browser asks for camera permission
- Use Chrome or Edge (best compatibility)
- Make sure you're on `localhost` or `https://`
- Check no other app is using the camera

### Low Confidence Scores
**Problem:** Card detection accuracy is low

**Tips:**
- Use good lighting (natural light is best)
- Hold card flat and centered in frame
- Avoid glare/reflections on card
- Make sure text is clearly visible
- Use high-resolution images

---

## 🎯 What You Can Do Now

1. **Scan Your Collection**
   - Pull out your Pokemon cards
   - Scan them one by one
   - See instant identification

2. **Test Different Cards**
   - Try various sets
   - Test different card conditions
   - Upload online card images

3. **Check Confidence**
   - See how accurate detections are
   - Compare different scanning angles
   - Find optimal lighting

4. **Integrate Further**
   - Add scanned cards to your vault (manual for now)
   - Look up prices after identification
   - Track your collection value

---

## 📚 Need More Help?

**Quick Reference:**
- This file: Quick start guide
- `README_CARD_SCANNER.md`: User guide
- `INTEGRATION_GUIDE.md`: Technical details
- `CARD_SCANNER_IMPLEMENTATION.md`: Full implementation

**Check Logs:**
- Backend: Terminal running `python app.py`
- Frontend: Browser console (F12)
- Network: Browser DevTools → Network tab

**File Locations:**
- Backend: `card-scanner-backend/`
- Frontend: `src/features/scanner/`
- Config: `.env` file in project root

---

## 🎉 You're All Set!

The Pokemon Card Scanner is fully integrated and ready to use!

**Start scanning:**
```bash
# Terminal 1
cd card-scanner-backend && source venv/bin/activate && python app.py
# Server runs on http://localhost:5001

# Terminal 2  
cd /Users/prayugsigdel/Coding/TCGTracker && npm run dev
# Frontend runs on http://localhost:5173

# Browser
# → Open http://localhost:5173
# → Click "Card Scanner"
# → Start scanning! 📸
```

---

**Happy Scanning! 🎴✨**
