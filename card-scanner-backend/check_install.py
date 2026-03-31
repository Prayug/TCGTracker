import sys
import site
import os

print("Python executable:", sys.executable)
print("\nSite packages:", site.getsitepackages())

for sp in site.getsitepackages():
    pcr_path = os.path.join(sp, 'pokemon_card_recognizer')
    print(f"\nChecking: {pcr_path}")
    print(f"Exists: {os.path.exists(pcr_path)}")
    
    if os.path.exists(pcr_path):
        print(f"Contents: {os.listdir(pcr_path)[:10]}")
        
        # Check for __init__.py
        init_file = os.path.join(pcr_path, '__init__.py')
        print(f"Has __init__.py: {os.path.exists(init_file)}")

print("\n" + "="*50)
print("Trying to import...")
try:
    import pokemon_card_recognizer
    print("✓ Successfully imported pokemon_card_recognizer")
    print(f"Module location: {pokemon_card_recognizer.__file__}")
except ImportError as e:
    print(f"✗ Import failed: {e}")
