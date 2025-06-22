# Pokemon TCG Price Tracking System

## Overview

Your TCGTracker now has a comprehensive historical price tracking system that goes beyond the basic rolling averages from pokemontcg.io. Here's what's been implemented:

## 🏗️ System Architecture

### Data Sources
1. **TCGCSV.com API** - Daily price snapshots from TCGPlayer marketplace
2. **Pokemon TCG API** - Rolling averages (avg1, avg7, avg30) from multiple sources  
3. **pokemonprice.com** - PSA data and additional price history via web scraping

### Database Schema
- **`price_history`** - Daily price snapshots with multiple sources
- **`rolling_averages`** - Pokemon TCG API rolling averages
- **`price_alerts`** - User-defined price alerts and notifications
- **`price_snapshots`** - Daily market summaries with gainers/losers

## 🚀 New Features

### 1. Enhanced Price Tracking Dashboard
- **Real-time market overview** with key metrics
- **Interactive price charts** showing trends over time
- **Top gainers/losers** updated daily
- **Market statistics** (average, median, volume)

### 2. Price Alerts System
- **Flexible alert types**:
  - Above/below specific price thresholds
  - Percentage change alerts
  - Custom notification rules
- **Smart alert management** prevents spam
- **Alert history** tracking

### 3. Advanced Analytics
- **Price comparison** between different time periods
- **Market trend analysis** with volatility calculations
- **Daily market snapshots** with statistical summaries
- **Export functionality** (JSON/CSV formats)

### 4. Multi-Source Data Integration
- **TCGCSV data** for comprehensive market coverage
- **Pokemon TCG API** for official rolling averages
- **Cross-platform price validation**

## 📊 API Endpoints

### Core Price Data
```
GET /api/prices/:productId              # Get price history for product
GET /api/prices/rolling/:cardId         # Get rolling averages for card
GET /api/prices/search/:cardName        # Search cards with price filters
```

### Analytics & Insights
```
GET /api/prices/compare/:productId      # Compare prices between periods
GET /api/prices/snapshots/daily        # Get daily market snapshots
GET /api/prices/analytics/trends        # Get market trend analysis
```

### Price Alerts
```
POST /api/prices/alerts                 # Create new price alert
GET /api/prices/alerts                  # Get active alerts
DELETE /api/prices/alerts/:alertId      # Delete/deactivate alert
```

### Data Export
```
GET /api/prices/export/:productId       # Export price data (JSON/CSV)
```

## 🔧 Usage Examples

### Creating a Price Alert
```javascript
// Alert when Charizard goes above $500
const alert = {
  productId: 12345,
  targetPrice: 500,
  alertType: 'above',
  threshold: 0
};

fetch('/api/prices/alerts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(alert)
});
```

### Getting Price Comparison
```javascript
// Compare prices from last 30 days vs last 7 days
const comparison = await fetch('/api/prices/compare/12345?period1=30&period2=7');
const data = await comparison.json();

console.log(`Price change: ${data.analysis.priceChange}%`);
```

### Exporting Price Data
```javascript
// Export as CSV
const exportData = await fetch('/api/prices/export/12345?format=csv');
const blob = await exportData.blob();
// File will be downloaded automatically
```

## 📈 Dashboard Features

### Market Overview Cards
- **Market Average** - Current average price with daily change
- **Total Cards Tracked** - Number of cards in database
- **Active Alerts** - Number of active price alerts
- **Median Price** - Current market median

### Price Trends Chart
- **Interactive line chart** showing price evolution
- **Customizable timeframes** (7, 30, 90 days, 1 year)
- **Hover tooltips** with detailed information

### Top Gainers/Losers
- **Daily percentage changes** for all tracked cards
- **Top 5 gainers** and **top 5 losers**
- **Price change amounts** in dollars and percentages

### Alert Management
- **Create new alerts** with simple form
- **View active alerts** with current status
- **Delete alerts** when no longer needed

## 🔄 Automated Data Collection

### Scheduled Tasks
- **Daily at 2:00 AM EST**: Full price data update from all sources
- **Every 30 minutes**: Price alert checks and notifications
- **On startup**: Initial data update and alert check

### Data Sources Update Frequency
- **TCGCSV**: Daily snapshots of TCGPlayer prices
- **Pokemon TCG API**: Rolling averages updated daily
- **pokemonprice.com**: PSA data and price history as needed

## 💡 Advanced Use Cases

### Investment Analysis
```javascript
// Find undervalued cards with high growth potential
const trends = await fetch('/api/prices/analytics/trends?days=90');
const data = await trends.json();

// Filter cards with consistent upward trends
const risers = data.data.filter(card => 
  card.avgPrice > card.previousAvgPrice * 1.2
);
```

### Market Monitoring
```javascript
// Get daily market snapshots for analysis
const snapshots = await fetch('/api/prices/snapshots/daily?days=30');
const market = await snapshots.json();

// Analyze market volatility
const volatility = calculateVolatility(market.data);
```

### Portfolio Tracking
```javascript
// Track multiple cards with alerts
const portfolio = [
  { productId: 12345, name: 'Charizard', alertPrice: 500 },
  { productId: 67890, name: 'Blastoise', alertPrice: 300 }
];

portfolio.forEach(card => {
  createPriceAlert(card.productId, card.alertPrice, 'above');
});
```

## 🚨 Price Alert Examples

### Basic Price Threshold
```javascript
{
  productId: 12345,
  targetPrice: 100,
  alertType: 'above',  // Alert when price goes above $100
  threshold: 0
}
```

### Percentage Change Alert
```javascript
{
  productId: 12345,
  targetPrice: 0,
  alertType: 'change_percent',
  threshold: 15  // Alert when price changes by 15% or more
}
```

### Below Threshold (Buying Opportunity)
```javascript
{
  productId: 12345,
  targetPrice: 50,
  alertType: 'below',  // Alert when price drops below $50
  threshold: 0
}
```

## 🔍 Data Analysis Features

### Price History Analysis
- **Min/Max/Average** prices over time
- **Volatility calculations** for risk assessment
- **Trend identification** (bullish/bearish/neutral)

### Market Insights
- **Daily gainers/losers** with percentage changes
- **Volume analysis** where available
- **Cross-platform price validation**

### Export & Reporting
- **CSV export** for spreadsheet analysis
- **JSON export** for programmatic use
- **Historical data** going back to first collection date

## 🎯 Next Steps & Enhancements

### Potential Additions
1. **Email notifications** for price alerts
2. **Discord/Slack integration** for real-time alerts
3. **Mobile app** with push notifications
4. **Advanced charting** with technical indicators
5. **Portfolio management** features
6. **Price predictions** using ML models

### Data Sources Expansion
- **eBay sold listings** for more market data
- **CardMarket** European pricing
- **Additional grading services** (BGS, CGC, etc.)

## 🛠️ Technical Implementation

### Backend Architecture
- **Node.js/Express** server with TypeScript
- **SQLite database** for efficient data storage
- **Cron jobs** for scheduled data updates
- **RESTful API** design

### Frontend Features
- **React** with TypeScript
- **Recharts** for data visualization
- **Tailwind CSS** for styling
- **Real-time data** updates

### Performance Optimizations
- **Database indexing** for fast queries
- **Batch processing** for large datasets
- **Rate limiting** to respect API limits
- **Caching strategies** for frequently accessed data

## 📚 Troubleshooting

### Common Issues
1. **Missing price data**: Check if product ID exists in database
2. **Alerts not triggering**: Verify alert is active and price thresholds
3. **Export not working**: Ensure product has historical data
4. **Dashboard not loading**: Check backend server status

### Debug Endpoints
```
GET /api/health          # Check server health
GET /api/status          # Get detailed server status
POST /api/check-alerts   # Manually trigger alert check
POST /api/update         # Manually trigger data update
```

Your TCGTracker now provides institutional-grade price tracking capabilities that rival paid services, all running locally with your own data! 