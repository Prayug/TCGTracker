# Setting Up the Card Reference Database

## The Problem

The card scanner backend requires a reference database of Pokemon cards to identify them. This database was supposed to come pre-built with the PyPI package, but there was an issue with the package installation.

## Solution Options

### Option 1: Use Pre-built Reference (Recommended - But Currently Broken)

The PyPI `pokemon-card-recognizer` package should include pre-built reference databases, but the package we tried had installation issues.

### Option 2: Build the Reference Database Yourself

**⚠️ Warning**: This takes 30-60 minutes and requires:
- Pokemon TCG API key (free from https://pokemontcg.io/)
- Good internet connection
- Patience!

**Steps**:
```bash
# 1. Get an API key from https://pokemontcg.io/

# 2. Run the build script
python build_reference.py YOUR_API_KEY_HERE
```

### Option 3: Use a Simpler Mock Version (For Testing)

For development/testing purposes, you can use a mock version that returns fake results:

1. The app will detect missing reference and show helpful errors
2. You can test the API endpoints without actual card recognition
3. Good for frontend development

## Current Status

Currently, the backend is set up but the reference database is missing. The server will start successfully but scanning will fail with a helpful error message explaining the situation.

## Next Steps

### For Production Use:
You'll need Option 1 or 2 above.

### For Development/Testing:
The current setup is fine! You can:
- Test the API endpoints
- Develop the frontend UI
- Mock the scan results in the frontend for now

## Technical Details

The reference database includes:
- All Pokemon cards across all sets
- OCR-optimized word dictionaries
- Card metadata (names, sets, numbers)
- Pre-computed classification features

File location (when built):
```
pokemon-card-recognizer/
  pokemon_card_recognizer/
    reference/
      data/
        ref_build/
          *.pkl  ← Reference database files
```

## Workaround for Now

Since we're in development mode, I recommend:

1. **Start the backend anyway**: It will run and respond to health checks
2. **Mock frontend responses**: Make the frontend work with fake scan results
3. **Build reference later**: When you're ready for real scanning, build the database

The backend is fully functional except for the actual card recognition part!
