/**
 * Locari Agent Finder - Main Application Server
 * Standalone Lead Discovery, Property Agent CRM, and Analytics Engine for Locari Nigeria
 */

const express = require('express');
const cors = require('cors');
const path = require('node:path');
const apiRoutes = require('./routes/api.js');
const { db } = require('./db.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static frontend dashboard
app.use(express.static(path.join(__dirname, '..', 'public')));

// Mount API routes
app.use('/api', apiRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    app: 'Locari Agent Finder',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Single Page Application fallback (universal middleware)
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    const indexPath = path.join(__dirname, '..', 'public', 'index.html');
    return res.sendFile(indexPath);
  }
  next();
});

// Start Server
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  🚀 LOCARI AGENT FINDER ENGINE RUNNING`);
    console.log(`  Local URL:   http://localhost:${PORT}`);
    console.log(`  API Status:  http://localhost:${PORT}/health`);
    console.log(`  Database:    Active (SQLite WAL mode)`);
    console.log(`====================================================`);
  });

  process.on('SIGINT', () => {
    console.log('\nGracefully shutting down Locari Agent Finder...');
    server.close(() => {
      process.exit(0);
    });
  });
}

module.exports = app;
