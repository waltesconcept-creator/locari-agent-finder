# Locari Agent Finder 🇳🇬
### Property Agent Discovery & Lead Management CRM for Locari

Locari Agent Finder is a standalone, lightweight, high-performance lead discovery and CRM application designed to solve Locari's primary supply-side challenge: discovering active property agents across Nigerian cities (Ibadan, Lagos, Abuja, etc.), extracting their publicly advertised business contact details, deduplicating contacts across communities, scoring leads, and managing outreach to convert them into active Locari agents.

---

## 🌟 Key Capabilities

1. **Multi-Channel Compliant Ingestion Engine**:
   - **Quick-Paste Multi-Post Parser**: Paste 1 or 20 advertisements copied from Facebook groups, WhatsApp property chats, or classifieds. Automatically splits, parses, normalizes phone numbers, and ingests them into the database.
   - **1-Click Browser Web Clipper (Bookmarklet)**: Enables scouts to browse Facebook property groups safely within their normal browser and clip listings with a single click—zero automated scraper bot bans, zero account risks, and zero credential storage.
   - **CSV / Spreadsheet Batch Upload**: Bulk import listings with automatic column mapping.
   - **Manual Single-Listing Modal**: Fast manual entry with instant NLP extraction.

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

6. **Real Analytics Dashboard**:
   - Every metric is computed directly from live SQLite database records (no mock numbers).
   - City distributions, role breakdowns, and source group rankings.

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js (v20+ or v24+)
- No external database or Docker required (uses native SQLite in WAL mode)

### 1. Start the Server
```powershell
# From the project directory:
cd C:\Users\Tope\.gemini\antigravity\scratch\locari-agent-finder

# Run with npm:
npm start

# Or run with the PowerShell helper:
.\start.ps1
```

### 2. Access the Application
Open your web browser and navigate to:
```
http://localhost:3000
```

### 3. Run Automated Tests
```powershell
npm test
```
The project includes 5 test suites covering:
- Phone parser and normalizer
- Property and location NLP matcher
- Role classifier and scoring formula
- Ingestion pipeline and deduplication service
- Complete REST API integration

---

## 📁 Project Structure

```
locari-agent-finder/
├── data/
│   └── locari_agent_finder.db   # SQLite database (WAL mode)
├── public/
│   ├── index.html               # Responsive SPA dashboard (Tailwind + Lucide)
│   ├── style.css                # Custom styling, badges & animations
│   └── app.js                   # Frontend application logic & modals
├── src/
│   ├── db.js                    # Database connection, schema & source seed
│   ├── nlp/
│   │   ├── phoneParser.js       # Nigerian phone regex & normalizer
│   │   ├── propertyParser.js    # Property type, price & location parser
│   │   └── agentClassifier.js   # Role classifier & 0-100 scoring engine
│   ├── routes/
│   │   └── api.js               # REST API endpoints
│   ├── services/
│   │   ├── deduplicationService.js # Entity resolution & agent profile refresh
│   │   └── ingestionService.js     # Multi-post parser & CSV processor
│   ├── seed.js                  # Realistic Nigerian listing seed dataset
│   └── server.js                # Express application server
├── tests/
│   ├── test_phoneParser.js
│   ├── test_propertyParser.js
│   ├── test_agentClassifier.js
│   ├── test_ingestionPipeline.js
│   └── test_apiEndpoints.js
├── package.json
├── start.ps1
└── README.md
```

---

## 🛡️ Operating Cost & Free-Tier Limits

- **Infrastructure Cost**: **$0.00 / ₦0.00**.
- Runs 100% locally or on any free hosting tier (e.g. Render, Railway, fly.io, or an office mini-PC).
- Uses embedded SQLite with zero third-party database charges.
- Requires no paid scraping proxies or banned APIs.
