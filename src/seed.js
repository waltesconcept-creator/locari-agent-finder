/**
 * Locari Agent Finder - Realistic Seed Dataset
 * Seeds realistic property advertisements from Ibadan and Lagos Facebook groups
 * through the actual ingestion and deduplication pipeline.
 */

const { db } = require('./db.js');
const { ingestBatch } = require('./services/ingestionService.js');

const REALISTIC_ADVERTISEMENTS = [
  // Agent 1: Kolawole Properties (Ibadan - Bodija & Akobo) - 3 listings to test repeat activity & lead scoring
  {
    rawText: `*DIRECT BRIEF IN OLD BODIJA, IBADAN*
Newly built executive 2 bedroom flat, all rooms ensuite with visitor's toilet.
Features:
- POP Ceiling all round
- Clean borehole water with dedicated pumping machine
- Separate prepaid meter
- Fenced and gated compound with night security guard
- Ample car parking space
Rent: ₦1,200,000 per annum.
Caution deposit: 100k.
Agency & Legal fee: 10%.
Inspection fee: ₦3,000.
Strictly for direct clients. Call or WhatsApp Agent Kola: 0803 456 7890 or wa.me/2348034567890`,
    posterName: 'Kolawole Properties',
    sourceId: 'src_ibadan_prop_1',
    originalPostUrl: 'https://www.facebook.com/groups/ibadanrealestateandapartments/posts/101928374',
    postedAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString() // 12 hours ago
  },
  {
    rawText: `*ROOM & PARLOUR SELF CONTAIN IN AKOBO OJURIN, IBADAN*
Very neat room and parlour, fully tiled, running water, gated estate, prepaid meter available.
Rent: ₦450,000 per annum.
Total package: ₦600,000.
Contact Kolawole Realtor: 08034567890`,
    posterName: 'Kolawole Properties',
    sourceId: 'src_ibadan_prop_2',
    originalPostUrl: 'https://www.facebook.com/groups/housesforrentinibadan/posts/201938475',
    postedAt: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString() // 36 hours ago
  },
  {
    rawText: `*COMMERCIAL OPEN SPACE / OFFICE AT DUGBE, IBADAN*
Prime commercial office space at Dugbe commercial district, suitable for microfinance, tech hub, or showroom.
Rent: ₦1,500,000 p.a.
Direct mandate. Call Kola: 0803 456 7890`,
    posterName: 'Kolawole Properties',
    sourceId: 'src_ibadan_prop_1',
    originalPostUrl: 'https://www.facebook.com/groups/ibadanrealestateandapartments/posts/301948576',
    postedAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString()
  },

  // Agent 2: Segun Alabi Real Estate (Lagos - Lekki & Ikate)
  {
    rawText: `*LEKKI PHASE 1 LUXURY 3 BEDROOM APARTMENT*
Serviced 3 bedroom flat with elevator, 24/7 electricity, swimming pool, fitted kitchen, and gym.
Rent: ₦6,500,000 per annum.
Service charge: ₦1,500,000.
Legal & Agency: 10/10.
Call Segun Alabi on 0812 345 6789 or 0809 111 2233. WhatsApp wa.me/2348123456789`,
    posterName: 'Segun Alabi',
    sourceId: 'src_lagos_rentals_1',
    originalPostUrl: 'https://www.facebook.com/groups/lagosapartmentsrentals/posts/401958677',
    postedAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString()
  },
  {
    rawText: `*MINI FLAT IN IKATE LEKKI*
Executive 1 bedroom apartment (mini flat) with wardrobe, ensuite, pop ceiling, clean water, gated estate security.
Rent: ₦2,200,000 p.a.
Contact Segun: 08123456789`,
    posterName: 'Segun Alabi',
    sourceId: 'src_lagos_rentals_1',
    originalPostUrl: 'https://www.facebook.com/groups/lagosapartmentsrentals/posts/501968778',
    postedAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString()
  },

  // Agent 3: Biodun Apex Homes (Ibadan - Samonda & UI)
  {
    rawText: `*SELF CONTAIN NEAR UNIVERSITY OF IBADAN (UI / SAMONDA)*
Decent self contain for students and working professionals.
Tiled floor, borehole water running 24/7, fenced compound with gate.
Rent: ₦300,000 / year.
Inspection fee: 2k.
Call Biodun: 0706 777 8899`,
    posterName: 'Biodun Apex Homes',
    sourceId: 'src_ibadan_prop_2',
    originalPostUrl: 'https://www.facebook.com/groups/housesforrentinibadan/posts/601978879',
    postedAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString()
  },

  // Agent 4: Yaba Mainland Direct Agent (Lagos - Yaba & Surulere)
  {
    rawText: `*2 BEDROOM FLAT IN YABA (AKOKA)*
Spacious 2 bedroom flat in a calm compound, all round tiles, prepaid meter.
Rent: ₦1,800,000 per annum.
Direct brief. 10% agency fee.
Call agent Femi: 0814 999 0011`,
    posterName: 'Femi Mainland Realtor',
    sourceId: 'src_lagos_mainland',
    originalPostUrl: 'https://www.facebook.com/groups/lagosmainlandrentals/posts/701988980',
    postedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString()
  },

  // Contact 5: Landlord Direct (Ibadan - Oluyole Estate) - Tests Landlord classification!
  {
    rawText: `*MY PERSONAL HOUSE IN OLUYOLE ESTATE IBADAN*
I am the owner. Letting out a spacious 3 bedroom bungalow with big compound, borehole, pre-paid meter.
Dealing directly with owner, no agency fee, no commission.
Rent: ₦1,400,000 per annum.
Call me directly on 0802 888 3344`,
    posterName: 'Chief Adebayo (Landlord)',
    sourceId: 'src_ibadan_prop_1',
    originalPostUrl: 'https://www.facebook.com/groups/ibadanrealestateandapartments/posts/801999081',
    postedAt: new Date(Date.now() - 1000 * 60 * 60 * 60).toISOString()
  }
];

function seed() {
  console.log('🌱 Ingesting realistic Nigerian property listings through pipeline...');
  const result = ingestBatch(REALISTIC_ADVERTISEMENTS, {
    method: 'Quick-Paste'
  });

  console.log(`✅ Seed Complete!`);
  console.log(`   - Posts received:    ${result.postsReceived}`);
  console.log(`   - Posts imported:    ${result.postsImported}`);
  console.log(`   - Agents created:    ${result.agentsCreated}`);
  console.log(`   - Agents updated:    ${result.agentsUpdated}`);
  console.log(`   - Duplicates caught: ${result.duplicatesDetected}`);

  // Query summary
  const agentCount = db.prepare('SELECT COUNT(*) as c FROM agents').get().c;
  const adCount = db.prepare('SELECT COUNT(*) as c FROM advertisements').get().c;
  console.log(`📊 Current DB Totals: ${agentCount} agents, ${adCount} advertisements.`);
}

if (require.main === module) {
  seed();
}

module.exports = { seed };
