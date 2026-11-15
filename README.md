# Locari Agent Finder 🇳🇬
### Property Agent Discovery, Facebook & Portal Scraper & Lead Management CRM for Locari

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/waltesconcept-creator/locari-agent-finder)
[![GitHub Repository](https://img.shields.io/badge/GitHub-waltesconcept--creator%2Flocari--agent--finder-blue?logo=github)](https://github.com/waltesconcept-creator/locari-agent-finder)
[![Docker](https://img.shields.io/badge/Docker-Containerized-2496ED?logo=docker)](Dockerfile)
[![Node.js](https://img.shields.io/badge/Node.js-v22-339933?logo=node.js)](package.json)
[![Database](https://img.shields.io/badge/SQLite-WAL%20Mode-003B57?logo=sqlite)](src/db.js)

Locari Agent Finder is a standalone, lightweight, high-performance lead discovery and CRM application designed to solve Locari's primary supply-side challenge: discovering active property agents across Nigerian cities (Ibadan, Lagos, Abuja, etc.), extracting their publicly advertised business contact details, deduplicating contacts across communities, scoring leads, and managing outreach to convert them into active Locari agents.

---

## ☁️ 1-Click Deployment to Render

You can deploy Locari Agent Finder to Render in under 2 minutes:

1. Click the **[Deploy to Render](https://render.com/deploy?repo=https://github.com/waltesconcept-creator/locari-agent-finder)** button above.
2. If prompted, sign in to your [Render.com](https://render.com) account (Free).
3. Render automatically reads [`render.yaml`](render.yaml) and [`Dockerfile`](Dockerfile) from this repository.
4. Click **Apply / Create Web Service**.
5. Render will build the container with Chromium and Node 22, and launch the service with a free live `https://<your-subdomain>.onrender.com` URL.

### Manual Render Setup (Alternative)
1. In the Render Dashboard, click **New +** -> **Web Service**.
2. Connect your GitHub repository: `waltesconcept-creator/locari-agent-finder`.
3. Choose **Docker** runtime.
4. Select the **Free** instance type.
5. Set Health Check path to `/health`.
6. Click **Create Web Service**.

---

## 🌟 Key Capabilities

1. **Automated Property Portals & Facebook Scraper**:
   - **Property Portals Scraper**: Deep-scrapes Nigerian real estate portals (PropertyPro, Nigeria Property Centre, etc.). Automatically extracts agent names, unmasked phone numbers from `tel:` links and WhatsApp links, rental prices, property types, and locations.
   - **Facebook Group Automated Scraper**: Connects to Facebook public groups with real-time SSE event streaming to your live dashboard console.
   - **Quick-Paste Multi-Post Parser**: Paste 1 or 50 advertisements copied from Facebook groups, WhatsApp property chats, or classifieds. Automatically splits, parses, normalizes phone numbers, and ingests them into the database.
   - **1-Click Browser Web Clipper (Bookmarklet)**: Enables scouts to browse Facebook property groups safely within their normal browser and clip listings with a single click—zero automated scraper bot bans, zero account risks, and zero credential storage.
   - **CSV / Spreadsheet Batch Upload**: Bulk import listings with automatic column mapping.

2. **Nigerian Property & Contact NLP Engine**:
   - **Phone Normalization**: Standardizes all Nigerian phone formats (`0803...`, `+234...`, `070...`, `090...`, `081...`, `091...`, spaces, hyphens, and `wa.me` links) to global E.164 (`+234XXXXXXXXXX`).
   - **Property Type Matching**: Identifies Self-contained, Room and Parlour, 1-Bedroom (Mini-flat), 2-Bedroom, 3-Bedroom, 4-Bedroom, Duplex, Commercial/Office, and Land.
   - **Location Intelligence**: Maps Nigerian cities and neighbourhoods (Ibadan: Bodija, Akobo, Oluyole, UI, Samonda, Jericho, Ring Road; Lagos: Lekki, Ikeja, Yaba, Surulere, Ajah, etc.).
   - **Financial Extraction**: Detects rental figures with currency shorthand (`₦`, `N`, `k`, `m`, `million`, `per annum`, `monthly`).

3. **Intelligent Deduplication & Entity Resolution**:
   - Anchors contacts by their normalized E.164 phone number.
   - If one agent posts 15 listings across 5 different Facebook groups, all listings are consolidated under one agent profile without deleting post history.
   - Content hashing (`SHA-256`) prevents importing identical duplicate posts.
   - Manual **Lead Merging** allows scouts to consolidate separate records.

4. **Agent Role Classification & Lead Scoring (0 - 100)**:
   - Estimates roles: `Likely Property Agent`, `Possible Property Agent`, `Landlord`, `Property Manager`, `Unclear`.
   - Dynamic 0–100 Lead Score calculated from:
     - Advertising volume (Max 30 pts)
     - Recency & freshness (Max 25 pts)
     - Portfolio diversity (Max 20 pts)
     - Contact completeness (Max 15 pts)
     - Priority target market alignment (Max 10 pts)
   - Every lead features a transparent score justification audit breakdown.

5. **Outreach & Conversion Pipeline**:
   - Log outreach attempts across Phone Calls, WhatsApp chats, SMS, and direct Locari invites.
   - Scheduled follow-up tracker for leads requiring next steps.
   - Do-Not-Contact compliance list enforcement.
   - 1-Click **"Sync to Locari"** button to convert leads into verified Locari agents.
   - **Database Reset & Clear All**: Built-in 1-click database wipe to clear test data at any time.

6. **Real Analytics Dashboard**:
   - Every metric is computed directly from live SQLite database records (no mock numbers).
   - City distributions, role breakdowns, and source group rankings.

---

## 🚀 Local Quick Start Guide

### Prerequisites
- Node.js (v20+ or v22+)
- Google Chrome or Chromium (for live scraping)

### 1. Clone & Install
```bash
git clone https://github.com/waltesconcept-creator/locari-agent-finder.git
cd locari-agent-finder
npm install
```

### 2. Start the Server
```powershell
npm start
# or on Windows:
.\start.ps1
```

### 3. Open in Browser
Visit `http://localhost:3000` to access the full responsive dashboard.

---

## 📁 Project Structure

```
locari-agent-finder/
├── Dockerfile                   # Debian Node 22 + Chromium for Render
├── render.yaml                  # Render Blueprint definition (1-click deploy)
├── package.json                 # Node.js dependencies & scripts
├── data/                        # Local SQLite databases (WAL mode)
├── public/
│   ├── index.html               # Responsive SPA dashboard (Tailwind + Lucide)
│   ├── style.css                # Custom styling, consoles & badges
│   └── app.js                   # Frontend logic, scraping stream & modals
├── src/
│   ├── server.js                # Express app server & health check
│   ├── db.js                    # Node 22 native SQLite & schema
│   ├── nlp/
│   │   ├── phoneParser.js       # Nigerian phone parser (+234 E.164)
│   │   ├── propertyParser.js    # Property type, rent & location NLP
│   │   └── agentClassifier.js   # Role classifier & 0-100 scoring
│   ├── routes/
│   │   └── api.js               # REST API endpoints & DB reset
│   └── services/
│       ├── facebookScraper.js   # Puppeteer browser scraping engine
│       ├── ingestionService.js  # Multi-post parser & CSV processor
│       └── deduplicationService.js # Entity resolution & agent merge
└── tests/                       # Unit & integration test suites
```

---

## 🛡️ Operating Cost & Free-Tier Limits

- **Infrastructure Cost**: **$0.00 / ₦0.00**.
- Runs 100% free locally or on Render's Free Docker Tier.
- Embedded SQLite with zero external database fees.
- Zero paid API keys required.
