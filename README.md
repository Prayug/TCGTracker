# Pokemon TCG Explorer

An interactive web application for exploring Pokemon Trading Card Game data, built with Streamlit and the Pokemon TCG API.

## Features

- 📊 **Interactive Visualizations**:
  - Top sets by number of cards
  - Sets released per year
  - Price distribution by card rarity
  - Average card prices by set

- 🔍 **Card Search**:
  - Search cards by name
  - View card images and details
  - Price information from CardMarket and TCGPlayer

- 📈 **Data Analysis**:
  - Complete set information
  - Release date tracking
  - Price trends and statistics

## Prerequisites

- Python 3.x
- Internet connection to access the Pokemon TCG API

## Setup

1. **Clone the repository (if applicable) or download the files.**

2. **Create a virtual environment (recommended):**
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows use `venv\Scripts\activate`
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

## Usage

Run the Streamlit app:
```bash
streamlit run app.py
```

This will:
1. Start the local web server
2. Open your default browser to the app
3. Display the interactive Pokemon TCG Explorer interface

## Using the Interface

1. **Sets Analysis**:
   - View graphs showing set statistics
   - See the complete list of Pokemon card sets
   - Track set releases over time

2. **Card Search**:
   - Enter a Pokemon card name in the search box
   - View matching cards with images
   - See price information and statistics
   - Compare prices across different sets and rarities

## API Documentation

For more information about the Pokemon TCG API:
- [Pokemon TCG API Documentation](https://docs.pokemontcg.io/)
- [API Reference](https://docs.pokemontcg.io/api-reference) 