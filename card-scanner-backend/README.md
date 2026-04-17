# Card Scanner Backend

Flask API backend for Pokemon Card Recognition using the pokemon-card-recognizer library.

## Setup

1. Create a Python virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

## Running the Server

```bash
python app.py
```

The server will run on `http://localhost:5001` (override with `PORT`).

## API Endpoints

### Health Check
```
GET /health
```

### Scan Card
```
POST /api/scan-card
```

Accepts either:
- **File upload**: multipart/form-data with 'image' field
- **Base64**: JSON with 'image' field containing base64-encoded image

**Response:**
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

### Available Sets
```
GET /api/available-sets
```

Returns list of all available Pokemon card sets.

## Notes

- The backend uses the "master" set by default which includes all Pokemon cards
- Temporary uploaded images are stored in `temp_uploads/` and cleaned up after processing
- CORS is enabled for the React frontend
