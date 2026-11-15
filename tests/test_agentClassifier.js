const assert = require('node:assert');
const { classifyAgentRole, calculateLeadScore } = require('../src/nlp/agentClassifier.js');

console.log('Testing agentClassifier.js...');

// Test 1: Agent role classification - multiple ads + agency fee
const role1 = classifyAgentRole({
  adCount: 4,
  allTexts: [
    'Direct brief in Bodija Ibadan. Inspection fee: 3k. Call 08031234567',
    '3 bedroom in Akobo. Agency & legal 10%. Call 08031234567'
  ],
  locations: ['Ibadan'],
  propertyTypes: ['2-Bedroom Flat', '3-Bedroom Flat']
});
assert.strictEqual(role1, 'Likely Property Agent');

// Test 2: Landlord role classification
const role2 = classifyAgentRole({
  adCount: 1,
  allTexts: [
    'My personal house in Ring Road, dealing directly with owner, no agency fee. Call 08123456789'
  ],
  locations: ['Ibadan'],
  propertyTypes: ['2-Bedroom Flat']
});
assert.strictEqual(role2, 'Landlord');

// Test 3: Lead score calculation
const scoreResult = calculateLeadScore({
  adCount: 4,
  lastActiveDate: new Date(),
  distinctLocationsCount: 2,
  distinctTypesCount: 2,
  hasName: true,
  hasWhatsapp: true,
  primaryCity: 'Ibadan'
});

// volume: 20 + recency: 25 + diversity: 20 + completeness: 15 + city: 10 = 90
assert.strictEqual(scoreResult.score, 90);
assert.strictEqual(scoreResult.breakdown.total, 90);
assert(scoreResult.explanation.includes('Ibadan'));
assert(scoreResult.explanation.includes('Active advertiser'));

console.log('✅ agentClassifier.js tests passed successfully!');
