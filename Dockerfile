# Production Dockerfile for Locari Agent Finder on Render
FROM node:22-slim

# Install system dependencies and Chromium for Puppeteer scraping
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Install npm dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application files
COPY . .

# Ensure data directory exists
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "src/server.js"]
