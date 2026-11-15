# Locari Agent Finder - Startup Script
Write-Host "====================================================" -ForegroundColor Emerald
Write-Host "   LOCARI AGENT FINDER • Lead Discovery & CRM" -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Emerald
Write-Host "Starting server on http://localhost:3000..." -ForegroundColor Yellow

$env:PORT = "3000"
node src/server.js
