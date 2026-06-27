"""
Build the Pokemon card reference database.

This script downloads card data from the Pokemon TCG API and builds
a reference database that the card recognizer uses to identify cards.

Note: This process can take 30-60 minutes depending on your internet speed.
"""

import sys
import os
import time

try:
    from pokemon_card_recognizer.reference.core.build import ReferenceBuild
except ImportError:
    print("ERROR: pokemon-card-recognizer not installed properly!")
    print("Please follow the installation instructions first.")
    sys.exit(1)


def check_reference_exists():
    """Check if reference database already exists."""
    ref_path = ReferenceBuild.get_path()
    if not os.path.exists(ref_path):
        return False
    pkl_files = [f for f in os.listdir(ref_path) if f.endswith(".pkl")]
    return len(pkl_files) > 0


def build_reference(api_key=None):
    """Build the card reference database."""

    print("\n" + "=" * 60)
    print("Pokemon Card Reference Database Builder")
    print("=" * 60)

    # Check if already built
    if check_reference_exists():
        ref_path = ReferenceBuild.get_path()
        pkl_files = [f for f in os.listdir(ref_path) if f.endswith(".pkl")]
        print(f"\nReference database already exists ({len(pkl_files)} set files).")
        print(f"Location: {ref_path}")
        print("Delete the ref_build directory and re-run to rebuild.")
        return True

    print("\nThis will:")
    print("  1. Download card data from Pokemon TCG API")
    print("  2. Download card images for OCR reference")
    print("  3. Build the reference database for card recognition")
    print("\nEstimated time: 30-60 minutes")

    # Get API key if not provided
    if not api_key:
        # Try to load from backend .env
        env_path = os.path.join(os.path.dirname(__file__), "..", "backend", ".env")
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("POKEMON_TCG_API_KEY=") and not line.startswith("#"):
                        api_key = line.split("=", 1)[1].strip().strip('"').strip("'")
                        if api_key:
                            print(f"\nLoaded API key from backend/.env")
                            break

    if not api_key:
        print("\n" + "-" * 60)
        print("Pokemon TCG API Key required")
        print("-" * 60)
        print("Get a free API key from: https://pokemontcg.io/")
        api_key = input("\nEnter your API key: ").strip()

    if not api_key:
        print("\nNo API key provided. Cannot build reference database.")
        return False

    print(f"\nStarting reference build at {time.strftime('%H:%M:%S')}...")
    print("This is a long process -- do not interrupt.\n")

    start = time.time()

    try:
        ReferenceBuild.build(ptcgsdk_api_key=api_key, download_images=True)
        elapsed = time.time() - start
        print(f"\nReference build completed in {elapsed / 60:.1f} minutes.")
        return True
    except Exception as e:
        elapsed = time.time() - start
        print(f"\nError building reference after {elapsed / 60:.1f} minutes: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    api_key = sys.argv[1] if len(sys.argv) > 1 else None

    success = build_reference(api_key)

    if success:
        print("\nReference database built successfully!")
        print("You can now start the Flask server with: python app.py")
    else:
        print("\nReference build failed or was skipped.")
        sys.exit(1)
