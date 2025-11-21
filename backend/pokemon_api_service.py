#!/usr/bin/env python3
"""
Pokemon TCG API Service using the official Python SDK
Provides reliable data fetching for TCGTracker backend pack pulling functionality
"""

import sys
import json
import os
from typing import Dict, List, Optional, Any
from dataclasses import asdict
import logging

from pokemontcgsdk import Card, Set, RestClient
from pokemontcgsdk.querybuilder import QueryBuilder

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class PokemonAPIService:
    """Service wrapper for Pokemon TCG SDK with enhanced reliability"""

    def __init__(self, api_key: Optional[str] = None):
        """Initialize the service with optional API key"""
        if api_key:
            RestClient.configure(api_key)
            logger.info("Configured Pokemon TCG API with key")
        else:
            logger.info("Using Pokemon TCG API without key (rate limited)")

    def get_card_by_id(self, card_id: str) -> Optional[Dict[str, Any]]:
        """Get a single card by ID"""
        try:
            card = Card.find(card_id)
            return asdict(card)
        except Exception as e:
            logger.error(f"Error fetching card {card_id}: {e}")
            return None

    def search_cards(self, query: Optional[str] = None, set_id: Optional[str] = None,
                    page: int = 1, page_size: int = 250, max_pages: int = 4) -> Dict[str, Any]:
        """
        Search cards with pagination support
        Returns dict with data, totalCount, page, pageSize, pagesFetched
        """
        try:
            # Build query
            qb = QueryBuilder(Card)

            if query:
                qb = qb.where(q=f'name:*{query}*')
            if set_id:
                qb = qb.where(q=f'set.id:{set_id}')

            # Get total count first
            all_cards = qb.all()
            total_count = len(all_cards) if hasattr(all_cards, '__len__') else 0

            # Paginate results
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size

            # Convert to list if needed and slice
            if hasattr(all_cards, '__getitem__'):
                paginated_cards = all_cards[start_idx:end_idx]
            else:
                # Fallback for different SDK versions
                paginated_cards = list(all_cards)[start_idx:end_idx] if hasattr(all_cards, '__iter__') else []

            # Convert dataclasses to dicts
            cards_data = [asdict(card) for card in paginated_cards]

            result = {
                'data': cards_data,
                'totalCount': total_count,
                'page': page,
                'pageSize': page_size,
                'pagesFetched': 1
            }

            logger.info(f"Found {len(cards_data)} cards for query '{query}' (page {page})")
            return result

        except Exception as e:
            logger.error(f"Error searching cards: {e}")
            return {
                'data': [],
                'totalCount': 0,
                'page': page,
                'pageSize': page_size,
                'pagesFetched': 0,
                'error': str(e)
            }

    def get_all_sets(self) -> List[Dict[str, Any]]:
        """Get all available sets"""
        try:
            sets = Set.all()
            sets_data = [asdict(set_obj) for set_obj in sets]
            logger.info(f"Retrieved {len(sets_data)} sets")
            return sets_data
        except Exception as e:
            logger.error(f"Error fetching sets: {e}")
            return []

    def get_set_by_id(self, set_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific set by ID"""
        try:
            set_obj = Set.find(set_id)
            return asdict(set_obj)
        except Exception as e:
            logger.error(f"Error fetching set {set_id}: {e}")
            return None

    def get_cards_by_rarity(self, set_id: Optional[str] = None, rarity: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get cards filtered by set and/or rarity"""
        try:
            qb = QueryBuilder(Card)

            query_parts = []
            if set_id:
                query_parts.append(f'set.id:{set_id}')
            if rarity:
                query_parts.append(f'rarity:"{rarity}"')

            if query_parts:
                qb = qb.where(q=' '.join(query_parts))

            cards = qb.all()
            cards_data = [asdict(card) for card in cards]

            logger.info(f"Found {len(cards_data)} cards for set '{set_id}' with rarity '{rarity}'")
            return cards_data

        except Exception as e:
            logger.error(f"Error fetching cards by rarity: {e}")
            return []

def main():
    """Main entry point for command-line usage"""
    if len(sys.argv) < 2:
        print("Usage: python pokemon_api_service.py <command> [args...]")
        print("Commands:")
        print("  search-cards <query> [set_id] [page] [page_size]")
        print("  get-card <card_id>")
        print("  get-sets")
        print("  get-set <set_id>")
        print("  get-cards-by-rarity [set_id] [rarity]")
        sys.exit(1)

    # Get API key from environment if available
    api_key = os.getenv('POKEMONTCG_IO_API_KEY')

    service = PokemonAPIService(api_key)

    command = sys.argv[1]

    try:
        if command == 'search-cards':
            query = sys.argv[2] if len(sys.argv) > 2 else None
            set_id = sys.argv[3] if len(sys.argv) > 3 else None
            page = int(sys.argv[4]) if len(sys.argv) > 4 else 1
            page_size = int(sys.argv[5]) if len(sys.argv) > 5 else 250

            result = service.search_cards(query, set_id, page, page_size)
            print(json.dumps(result, indent=2))

        elif command == 'get-card':
            if len(sys.argv) < 3:
                print("Error: card_id required")
                sys.exit(1)

            card_id = sys.argv[2]
            result = service.get_card_by_id(card_id)
            print(json.dumps(result, indent=2) if result else json.dumps(None))

        elif command == 'get-sets':
            result = service.get_all_sets()
            print(json.dumps(result, indent=2))

        elif command == 'get-set':
            if len(sys.argv) < 3:
                print("Error: set_id required")
                sys.exit(1)

            set_id = sys.argv[2]
            result = service.get_set_by_id(set_id)
            print(json.dumps(result, indent=2) if result else json.dumps(None))

        elif command == 'get-cards-by-rarity':
            set_id = sys.argv[2] if len(sys.argv) > 2 else None
            rarity = sys.argv[3] if len(sys.argv) > 3 else None

            result = service.get_cards_by_rarity(set_id, rarity)
            print(json.dumps(result, indent=2))

        else:
            print(f"Unknown command: {command}")
            sys.exit(1)

    except Exception as e:
        logger.error(f"Command execution failed: {e}")
        print(json.dumps({'error': str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    main()
