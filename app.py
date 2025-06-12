import streamlit as st
import requests
import pandas as pd
from datetime import datetime

# The Pokemon TCG API base URL
API_BASE_URL = "https://api.pokemontcg.io/v2"

# Set page config
st.set_page_config(
    page_title="Pokemon TCG Explorer",
    page_icon="🎴",
    layout="wide"
)

# Custom CSS
st.markdown("""
    <style>
    .main {
        padding: 20px;
    }
    .stTitle {
        color: #FF4B4B;
    }
    .card-container {
        border: 1px solid #ddd;
        border-radius: 5px;
        padding: 10px;
        margin: 5px;
        background-color: white;
    }
    .enlarge-img {
        cursor: pointer;
        transition: box-shadow 0.2s;
    }
    .enlarge-img:hover {
        box-shadow: 0 0 10px #888;
    }
    </style>
""", unsafe_allow_html=True)

def get_card_sets():
    """Fetches all Pokemon card sets."""
    url = f"{API_BASE_URL}/sets"
    try:
        response = requests.get(url)
        response.raise_for_status()
        return response.json().get("data", [])
    except Exception as e:
        st.error(f"Error fetching sets: {str(e)}")
        return []

def search_cards(query=None, set_id=None):
    """Searches for Pokemon cards based on query and/or set ID."""
    url = f"{API_BASE_URL}/cards"
    params = {}
    
    if query:
        params["q"] = f"name:{query}"
    if set_id:
        params["q"] = f"set.id:{set_id}"
    if query and set_id:
        params["q"] = f"name:{query} set.id:{set_id}"
    
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        return response.json().get("data", [])
    except Exception as e:
        st.error(f"Error searching cards: {str(e)}")
        return []

def get_tcg_price(card):
    """Extract the best available TCGPlayer price from a card."""
    prices = card.get('tcgplayer', {}).get('prices', {})
    if not prices:
        return 0.0
    
    # Check different variants in priority order
    variants = ['normal', 'holofoil', '1stEditionHolofoil', '1stEditionNormal', 'unlimited']
    for variant in variants:
        if variant in prices and prices[variant].get('market'):
            return float(prices[variant]['market'])
    return 0.0

def get_card_data(card):
    """Extract relevant data from a card for display and sorting."""
    return {
        'name': card['name'],
        'set': card['set']['name'],
        'set_id': card['set']['id'],
        'rarity': card.get('rarity', 'N/A'),
        'price': get_tcg_price(card),
        'image': card['images']['small'],
        'image_large': card['images'].get('large', card['images']['small']),
        'release_date': card['set'].get('releaseDate', ''),
        'card_type': card.get('types', ['N/A'])[0] if card.get('types') else 'N/A',
        'artist': card.get('artist', 'N/A')
    }

# State for selected card
if 'selected_card' not in st.session_state:
    st.session_state['selected_card'] = None

def show_selected_card(card):
    st.markdown("---")
    st.image(card['image_large'], caption=card['name'], use_column_width=True)
    st.markdown(f"**Name:** {card['name']}")
    st.markdown(f"**Set:** {card['set']}")
    st.markdown(f"**Rarity:** {card['rarity']}")
    if card['price'] > 0:
        st.markdown(f"**Price:** ${card['price']:.2f}")
    else:
        st.markdown("**Price:** Not available")
    st.markdown(f"**Release Date:** {card['release_date']}")
    st.markdown(f"**Artist:** {card['artist']}")
    st.markdown("---")

# Title
st.title("🎴 Pokemon TCG Explorer")
st.markdown("Search and sort Pokemon cards!")

# Sidebar
st.sidebar.header("Search & Sort")
search_query = st.sidebar.text_input("Search cards by name:", "")

# Sorting Options
sort_by = st.sidebar.selectbox(
    "Sort by:",
    ["Price (High to Low)", "Price (Low to High)", 
     "Name (A-Z)", "Name (Z-A)",
     "Set (A-Z)", "Set (Z-A)",
     "Release Date (Newest)", "Release Date (Oldest)"]
)

# Main content
if search_query:
    cards = search_cards(query=search_query)
    
    if cards:
        # Convert cards to DataFrame for easier sorting
        cards_df = pd.DataFrame([get_card_data(card) for card in cards])
        
        # Apply sorting
        if sort_by == "Price (High to Low)":
            cards_df = cards_df.sort_values('price', ascending=False)
        elif sort_by == "Price (Low to High)":
            cards_df = cards_df.sort_values('price', ascending=True)
        elif sort_by == "Name (A-Z)":
            cards_df = cards_df.sort_values('name', ascending=True)
        elif sort_by == "Name (Z-A)":
            cards_df = cards_df.sort_values('name', ascending=False)
        elif sort_by == "Set (A-Z)":
            cards_df = cards_df.sort_values('set', ascending=True)
        elif sort_by == "Set (Z-A)":
            cards_df = cards_df.sort_values('set', ascending=False)
        elif sort_by == "Release Date (Newest)":
            cards_df = cards_df.sort_values('release_date', ascending=False)
        elif sort_by == "Release Date (Oldest)":
            cards_df = cards_df.sort_values('release_date', ascending=True)
        
        # Display cards in a grid
        st.header(f"🎴 Found Cards ({len(cards_df)} results)")
        st.markdown(f"**Sorted by:** {sort_by}")
        
        # Show enlarged card if selected
        if st.session_state['selected_card'] is not None:
            show_selected_card(st.session_state['selected_card'])
        
        # Display cards in a grid
        cards_per_row = 3
        for i in range(0, len(cards_df), cards_per_row):
            cols = st.columns(cards_per_row)
            for j, col in enumerate(cols):
                if i + j < len(cards_df):
                    card = cards_df.iloc[i + j]
                    with col:
                        st.markdown('<div class="card-container">', unsafe_allow_html=True)
                        # Make image clickable using a form
                        with st.form(key=f"form_{i}_{j}"):
                            submitted = st.form_submit_button(label="", use_container_width=True)
                            st.image(card['image'], caption=card['name'], use_column_width=True)
                            if submitted:
                                st.session_state['selected_card'] = card
                        st.markdown(f"**Name:** {card['name']}")
                        st.markdown(f"**Set:** {card['set']}")
                        st.markdown(f"**Rarity:** {card['rarity']}")
                        if card['price'] > 0:
                            st.markdown(f"**Price:** ${card['price']:.2f}")
                        else:
                            st.markdown("**Price:** Not available")
                        st.markdown('</div>', unsafe_allow_html=True)
    else:
        st.info("No cards found. Try a different search term!")
else:
    st.info("Enter a search term to find Pokemon cards!")

# Footer
st.markdown("---")
st.markdown("Data provided by [Pokemon TCG API](https://pokemontcg.io/)") 