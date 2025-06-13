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

# Sleek CSS for card images
st.markdown("""
    <style>
    .sleek-img {
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.07);
        transition: transform 0.15s, box-shadow 0.15s;
        margin-bottom: 0.5rem;
    }
    .sleek-img:hover {
        transform: scale(1.04);
        box-shadow: 0 4px 16px rgba(0,0,0,0.18);
    }
    .sleek-caption {
        text-align: center;
        font-size: 1rem;
        margin-bottom: 0.2rem;
        margin-top: 0.2rem;
    }
    .sleek-info {
        text-align: center;
        font-size: 0.95rem;
        margin-bottom: 0.2rem;
        color: #333;
    }
    /* Remove Streamlit's default card/container background and border for a sleeker look */
    [data-testid="stVerticalBlock"] > div {
        background: none !important;
        box-shadow: none !important;
        border: none !important;
        padding: 0 !important;
    }
    .block-container {
        padding-top: 1.5rem;
    }
    .fullscreen-btn {
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(255,255,255,0.85);
        border: none;
        border-radius: 6px;
        font-size: 1.3rem;
        padding: 0.2rem 0.5rem;
        cursor: pointer;
        z-index: 2;
        opacity: 0;
        transition: opacity 0.2s;
    }
    .card-container {
        position: relative;
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    .card-container:hover .fullscreen-btn {
        opacity: 1;
    }
    .fullscreen-icon {
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(34,34,34,0.75);
        border-radius: 6px;
        padding: 0.3rem;
        z-index: 2;
        opacity: 0;
        transition: opacity 0.2s;
        pointer-events: none;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .fullscreen-icon svg {
        width: 22px;
        height: 22px;
    }
    .card-container:hover .fullscreen-icon {
        opacity: 1;
    }
    .invisible-btn {
        position: absolute;
        top: 0;
        right: 0;
        height: 100%;
        width: 100%;
        opacity: 0;
        z-index: 3;
        background: none;
        border: none;
        cursor: pointer;
    }
    /* Position the button container relative to the column */
    [data-testid="stVerticalBlock"] > [data-testid="stHorizontalBlock"] > div[data-testid="stVerticalBlock"] {
        position: relative;
    }

    /* Make the Streamlit button an invisible overlay */
    [data-testid="stVerticalBlock"] .stButton {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 3;
    }

    [data-testid="stVerticalBlock"] .stButton button {
        background-color: transparent;
        border: none;
        color: transparent;
        width: 100%;
        height: 100%;
        cursor: pointer;
    }

    #modal-overlay .stButton button {
        position: absolute;
        top: 15px;
        right: 15px;
        background: white;
        border: none;
        border-radius: 50%;
        width: 36px;
        height: 36px;
        font-size: 24px;
        line-height: 36px;
        color: #333;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    }
    #modal-overlay .stButton button:hover {
        background: #f0f0f0;
        color: #000;
    }

    .card-wrapper {
        position: relative;
    }

    .card-wrapper .stButton > button {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 3;
        background: transparent;
        border: none;
        color: transparent;
        cursor: pointer;
    }
    
    .modal-close-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10001;
    }

    .modal-close-container .stButton > button {
        background: white;
        border: none;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        font-size: 24px;
        line-height: 1;
        color: #333;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    }
    .modal-close-container .stButton > button:hover {
        background: #f0f0f0;
        color: #000;
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

def show_modal(card):
    # The modal background and card display
    st.markdown(
        f'''
        <div id="modal-overlay" style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;">
            <div style="background:white;padding:2rem 2rem 1rem 2rem;border-radius:18px;box-shadow:0 8px 32px rgba(0,0,0,0.25);max-width:400px;width:90vw;position:relative;text-align:center;">
                <img src="{card['image_large']}" alt="{card['name']}" style="width:100%;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.12);margin-bottom:1rem;"/>
                <div class='sleek-caption'><b>{card['name']}</b></div>
                <div class='sleek-info'><b>Set:</b> {card['set']}<br><b>Rarity:</b> {card['rarity']}<br><b>Price:</b> {'${:.2f}'.format(card['price']) if card['price'] > 0 else 'Not available'}</div>
            </div>
        </div>
        ''',
        unsafe_allow_html=True
    )
    
    # Position the close button on top of the overlay
    st.markdown('<div class="modal-close-container">', unsafe_allow_html=True)
    if st.button("✕", key="close_modal_btn", help="Close"):
        st.session_state['selected_card'] = None
        st.rerun()
    st.markdown('</div>', unsafe_allow_html=True)

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
        
        # Modal logic
        if st.session_state['selected_card'] is not None:
            show_modal(st.session_state['selected_card'])
        
        # Display cards in a grid
        cards_per_row = 3
        for i in range(0, len(cards_df), cards_per_row):
            cols = st.columns(cards_per_row)
            for j, col in enumerate(cols):
                if i + j < len(cards_df):
                    card = cards_df.iloc[i + j]
                    with col:
                        st.markdown('<div class="card-wrapper">', unsafe_allow_html=True)
                        
                        # The button is an invisible overlay, positioned by the .card-wrapper
                        btn_key = f"fullscreen_{i}_{j}"
                        if st.button("", key=btn_key, help="Full screen"):
                            st.session_state['selected_card'] = card
                            st.rerun()

                        # SVG icon for fullscreen
                        fullscreen_svg_icon = """
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                        </svg>
                        """

                        # Use a single st.markdown for the card's visual HTML structure
                        st.markdown(
                            f"""
                            <div class="card-container">
                                <div class="fullscreen-icon">{fullscreen_svg_icon}</div>
                                <img src="{card["image"]}" alt="{card["name"]}" class="sleek-img" style="width:100%;"/>
                                <div class='sleek-caption'>{card['name']}</div>
                                <div class='sleek-info'>
                                    <b>Set:</b> {card['set']}<br>
                                    <b>Rarity:</b> {card['rarity']}<br>
                                    <b>Price:</b> {'${:.2f}'.format(card['price']) if card['price'] > 0 else 'Not available'}
                                </div>
                            </div>
                            """,
                            unsafe_allow_html=True
                        )

                        st.markdown('</div>', unsafe_allow_html=True)
    else:
        st.info("No cards found. Try a different search term!")
else:
    st.info("Enter a search term to find Pokemon cards!")

# Footer
st.markdown("---")
st.markdown("Data provided by [Pokemon TCG API](https://pokemontcg.io/)") 