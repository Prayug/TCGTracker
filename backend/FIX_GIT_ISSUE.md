# 🚨 Fix Git Large File Issue

Your `tcg-prices.db` file (119 MB) exceeds GitHub's 100 MB limit.

## Quick Fix (3 Steps)

### Step 1: Remove database from Git history
```bash
cd /Users/prayugsigdel/Coding/TCGTracker

# Remove the large file from Git history
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch backend/tcg-prices.db' \
  --prune-empty --tag-name-filter cat -- --all

# Or use the faster BFG tool (if installed):
# bfg --delete-files tcg-prices.db
```

### Step 2: Force push to GitHub
```bash
git push origin --force --all
```

### Step 3: Clean up local references
```bash
git for-each-ref --format='delete %(refname)' refs/original | git update-ref --stdin
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

## Optimize Database (Optional)

Reduce database size by keeping only recent data:

```bash
cd backend
python3 optimize_database.py
```

This will:
- Keep only last 30 days of price history
- Delete older data
- Vacuum database to reclaim space
- Should reduce size by ~60-80%

## Prevent Future Issues

✅ Database is now in `.gitignore` - it won't be committed again!

## Alternative: Use Git LFS

If you need to track the database in Git:

```bash
# Install Git LFS
brew install git-lfs
git lfs install

# Track database files
git lfs track "backend/*.db"
git add .gitattributes
git commit -m "Add Git LFS tracking"

# Add and commit database
git add backend/tcg-prices.db
git commit -m "Add database with LFS"
git push
```

---

**Note**: The `.gitignore` file has been created to prevent this issue in the future!

