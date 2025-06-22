import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import priceHistoryRouter from './routes/priceHistory';
import { initializeDatabase } from './db/database';
import { updatePriceData } from './services/dataFetcher';
import { alertService } from './services/alertService';

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// Initialize the database
console.log('Initializing database...');
initializeDatabase();

// Schedule daily data updates at 2 AM
cron.schedule('0 2 * * *', async () => {
  console.log('Running scheduled daily price data update...');
  await updatePriceData();
}, {
  timezone: "America/New_York"
});

// Schedule price alert checks every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  console.log('Running scheduled price alert check...');
  await alertService.checkPriceAlerts();
});

// Run initial data update on startup (after a short delay)
setTimeout(async () => {
  console.log('Running initial price data update...');
  await updatePriceData();
}, 5000);

// Run initial alert check on startup
setTimeout(async () => {
  console.log('Running initial price alert check...');
  await alertService.checkPriceAlerts();
}, 10000);

app.use('/api/prices', priceHistoryRouter);

// Manual update endpoint
app.post('/api/update', async (req, res) => {
  try {
    console.log('Manual price data update requested...');
    updatePriceData(); // Don't await - let it run in background
    res.status(202).json({ 
      success: true, 
      message: 'Data update process started in background.' 
    });
  } catch (error) {
    console.error('Error starting manual update:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to start update process' 
    });
  }
});

// Manual alert check endpoint
app.post('/api/check-alerts', async (req, res) => {
  try {
    console.log('Manual alert check requested...');
    await alertService.checkPriceAlerts();
    res.json({ 
      success: true, 
      message: 'Price alerts checked successfully.' 
    });
  } catch (error) {
    console.error('Error checking alerts:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to check alerts' 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Get server status
app.get('/api/status', async (req, res) => {
  try {
    const alertHistory = await alertService.getAlertHistory(1); // Last 24 hours
    
    res.json({
      status: 'running',
      timestamp: new Date().toISOString(),
      scheduledTasks: {
        dataUpdate: 'Daily at 2:00 AM EST',
        alertCheck: 'Every 30 minutes'
      },
      recentAlerts: alertHistory.length,
      endpoints: {
        prices: '/api/prices',
        manualUpdate: '/api/update',
        alertCheck: '/api/check-alerts',
        health: '/api/health'
      }
    });
  } catch (error) {
    console.error('Error getting status:', error);
    res.status(500).json({ 
      status: 'error', 
      error: 'Failed to get status' 
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    message: 'TCGTracker Backend is running!',
    version: '1.0.0',
    endpoints: {
      prices: '/api/prices',
      status: '/api/status',
      health: '/api/health'
    }
  });
});

app.listen(port, () => {
  console.log(`🚀 TCGTracker Backend server running on http://localhost:${port}`);
  console.log(`📈 Price data updates scheduled daily at 2:00 AM EST`);
  console.log(`🚨 Price alerts checked every 30 minutes`);
  console.log(`📊 API documentation available at http://localhost:${port}/api/status`);
});
