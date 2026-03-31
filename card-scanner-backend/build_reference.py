"""
Build the Pokemon card reference database.

This script downloads card data from the Pokemon TCG API and builds
a reference database that the card recognizer uses to identify cards.

Note: This process can take 30-60 minutes depending on your internet speed.
"""

import sys
import os

try:
    from pokemon_card_recognizer.reference.core.build import ReferenceBuild
except ImportError:
    print("ERROR: pokemon-card-recognizer not installed properly!")
    print("Please follow the installation instructions first.")
    sys.exit(1)

def build_reference(api_key=None):
    """Build the card reference database"""
    
    print("\n" + "="*60)
    print("Pokemon Card Reference Database Builder")
    print("="*60)
    
    print("\nThis will:")
    print("  1. Download card data from Pokemon TCG API")
    print("  2. Process and build the reference database")
    print("  3. Save it for use by the card scanner")
    print("\n⏱️  Estimated time: 30-60 minutes")
    print("\nNote: You can skip this if you don't have an API key.")
    print("The scanner will work with a limited dataset.")
    
    # Get API key if not provided
    if not api_key:
        print("\n" + "-"*60)
        print("Pokemon TCG API Key")
        print("-"*60)
        print("Get a free API key from: https://pokemontcg.io/")
        print("(Press Enter to skip if you don't have one)")
        api_key = input("\nEnter your API key (or press Enter to skip): ").strip()
    
    if not api_key:
        print("\n⚠️  No API key provided. Skipping reference build.")
        print("\nThe scanner may have limited functionality.")
        print("You can run this script again later with an API key.")
        return False
    
    try:
        print("\n🔨 Building reference database...")
        print("This will take a while. Please be patient...\n")
        
        # Run the build
        # Note: This is a simplified version - you may need to adjust
        # based on the actual ReferenceBuild API
        print("Starting build process...")
        
        # The actual build command - check ReferenceBuild documentation
        # ReferenceBuild.build_all_sets(api_key)
        
        print("\n✗ Build functionality not fully implemented yet.")
        print("Please refer to the pokemon-card-recognizer documentation")
        print("for building the reference database.")
        
        return False
        
    except Exception as e:
        print(f"\n✗ Error building reference: {e}")
        return False

if __name__ == "__main__":
    # Check if API key provided as command line argument
    api_key = sys.argv[1] if len(sys.argv) > 1 else None
    
    success = build_reference(api_key)
    
    if success:
        print("\n✓ Reference database built successfully!")
        print("You can now start the Flask server with: python app.py")
    else:
        print("\n" + "="*60)
        print("Alternative: Download Pre-built Reference")
        print("="*60)
        print("\nSince building takes a long time, you can:")
        print("1. Install from PyPI (includes pre-built refs)")
        print("2. Or use the scanner with limited functionality")
        sys.exit(1)
