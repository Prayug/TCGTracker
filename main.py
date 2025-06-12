import os
import requests
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# The Pokemon TCG API base URL
API_BASE_URL = "https://api.pokemontcg.io/v2"

def get_card_sets():
    """Fetches all Pokemon card sets."""
    url = f"{API_BASE_URL}/sets"
    
    try:
        response = requests.get(url)
        response.raise_for_status()
        sets_data = response.json()
        
        print("\nAvailable Pokemon Card Sets:")
        for card_set in sets_data.get("data", []):
            print(f"- {card_set['name']} ({card_set['id']})")
            print(f"  Released: {card_set['releaseDate']}")
            print(f"  Total Cards: {card_set['total']}")
            print()
            
        return sets_data.get("data")
            
    except requests.exceptions.HTTPError as errh:
        print(f"Http Error: {errh}")
        print(f"Response content: {response.content}")
    except requests.exceptions.RequestException as err:
        print(f"Request Error: {err}")
    return None

def search_cards(query=None, set_id=None):
    """
    Searches for Pokemon cards based on query and/or set ID.
    
    Args:
        query (str, optional): Search term for card name
        set_id (str, optional): Specific set ID to search within
    """
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
        cards_data = response.json()
        
        print(f"\nFound {len(cards_data.get('data', []))} cards:")
        for card in cards_data.get("data", []):
            print(f"\n- {card['name']} ({card['id']})")
            print(f"  Set: {card['set']['name']} ({card['set']['id']})")
            print(f"  Rarity: {card.get('rarity', 'N/A')}")
            if 'cardmarket' in card and 'prices' in card['cardmarket']:
                print(f"  Price (CardMarket): €{card['cardmarket']['prices'].get('averageSellPrice', 'N/A')}")
            if card.get('tcgplayer', {}).get('prices'):
                print("  TCGPlayer Prices:")
                for variant, price_info in card['tcgplayer']['prices'].items():
                    print(f"    - {variant}: ${price_info.get('market', 'N/A')}")
            print(f"  Image URL: {card.get('images', {}).get('small')}")
            
        return cards_data.get("data")
            
    except requests.exceptions.HTTPError as errh:
        print(f"Http Error: {errh}")
        print(f"Response content: {response.content}")
    except requests.exceptions.RequestException as err:
        print(f"Request Error: {err}")
    return None

if __name__ == "__main__":
    print("Pokemon TCG API Demo")
    print("===================")
    
    # First, let's get all available sets
    print("\nFetching Pokemon card sets...")
    sets = get_card_sets()
    
    if sets:
        # As an example, let's search for Charizard cards
        print("\nSearching for Charizard cards...")
        charizard_cards = search_cards(query="charizard")
        
        # You can also search within a specific set
        # For example, using the first set from our sets list
        if sets:
            first_set = sets[0]
            print(f"\nSearching for cards in the {first_set['name']} set...")
            set_cards = search_cards(set_id=first_set['id'])
    
    print("\n--- Script Finished ---")
    print("You can modify the script to search for different Pokemon cards or sets!") 