/**
 * Locari Agent Finder - Frontend Application Script
 */

let currentTab = 'scraper';
let currentAgentsPage = 1;
let currentAgentDetailId = null;
let searchDebounceTimer = null;

// Initialize app on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  fetchQuickScraperResults();
  fetchDashboardStats();
  fetchFollowups();
  checkFacebookSessionStatus();
});

// Toast notification helper
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const bg = type === 'success' ? 'bg-emerald-800 text-white' : (type === 'error' ? 'bg-red-800 text-white' : (type === 'info' ? 'bg-blue-800 text-white' : 'bg-slate-800 text-white'));
  toast.className = `${bg} px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold flex items-center space-x-2 transition-all transform translate-y-2 pointer-events-auto`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-4');
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

// ==========================================
// NAVIGATION & MODALS
// ==========================================
function switchTab(tabName) {
  currentTab = tabName;
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));

  const navBtn = document.getElementById(`nav-${tabName}`);
  if (navBtn) navBtn.classList.add('active');

  const pane = document.getElementById(`tab-${tabName}`);
  if (pane) pane.classList.remove('hidden');

  if (tabName === 'scraper') fetchQuickScraperResults();
  if (tabName === 'agents') fetchAgents(currentAgentsPage);
  if (tabName === 'dashboard') fetchDashboardStats();
  if (tabName === 'outreach') fetchFollowups();

  lucide.createIcons();
}

function switchIngestMode(mode) {
  document.querySelectorAll('.ingest-subtab').forEach(b => b.classList.remove('active'));
  ['scraper', 'quick', 'clipper', 'csv'].forEach(m => {
    const pane = document.getElementById(`pane-ingest-${m}`);
    if (pane) pane.classList.add('hidden');
  });

  const activeTabBtn = document.getElementById(`sub-ingest-${mode}`);
  if (activeTabBtn) activeTabBtn.classList.add('active');

  const targetPane = document.getElementById(`pane-ingest-${mode}`);
  if (targetPane) targetPane.classList.remove('hidden');

  lucide.createIcons();
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('hidden');
    lucide.createIcons();
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('hidden');
}

// ==========================================
// 1. DASHBOARD ANALYTICS
// ==========================================
async function fetchDashboardStats() {
  try {
    const res = await fetch('/api/dashboard/stats').then(r => r.json());
    if (!res.success) return;

    const { summary, cityBreakdown, roleBreakdown, topSources, mostActiveAgents, recentAds } = res.data;

    // Update KPI numbers
    document.getElementById('stat-total-leads').textContent = (summary.totalLeads || 0).toLocaleString();
    document.getElementById('stat-qualified-agents').textContent = (summary.qualifiedAgents || 0).toLocaleString();
    document.getElementById('stat-contacted-leads').textContent = (summary.contactedLeads || 0).toLocaleString();
    document.getElementById('stat-interested-leads').textContent = (summary.interestedLeads || 0).toLocaleString();
    document.getElementById('stat-registered-locari').textContent = (summary.registeredLocari || 0).toLocaleString();
    document.getElementById('stat-total-ads').textContent = (summary.totalAds || 0).toLocaleString();

    // Render City Breakdown
    const cityList = document.getElementById('city-breakdown-list');
    if (cityBreakdown.length === 0) {
      cityList.innerHTML = '<div class="text-xs text-slate-400 text-center py-2">No city data indexed yet.</div>';
    } else {
      cityList.innerHTML = cityBreakdown.map(c => `
        <div class="flex items-center justify-between text-xs py-1 border-b border-slate-50 last:border-0">
          <div class="font-medium text-slate-700 flex items-center">
            <span class="w-2 h-2 rounded-full bg-emerald-500 mr-2"></span>
            ${escapeHtml(c.city)}
          </div>
          <div class="flex items-center space-x-2">
            <span class="font-bold text-slate-900">${c.count} leads</span>
            <span class="text-[10px] text-slate-400">avg score: ${c.avg_score || 0}</span>
          </div>
        </div>
      `).join('');
    }

    // Render Role Breakdown
    const roleList = document.getElementById('role-breakdown-list');
    if (roleBreakdown.length === 0) {
      roleList.innerHTML = '<div class="text-xs text-slate-400 text-center py-2">No roles classified yet.</div>';
    } else {
      roleList.innerHTML = roleBreakdown.map(r => `
        <div class="flex items-center justify-between text-xs py-1 border-b border-slate-50 last:border-0">
          <div class="font-medium text-slate-700 flex items-center">
            <span class="w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
            ${escapeHtml(r.role)}
          </div>
          <span class="font-bold text-slate-900">${r.count}</span>
        </div>
      `).join('');
    }

    // Render Top Sources
    const sourcesList = document.getElementById('top-sources-list');
    if (topSources.length === 0) {
      sourcesList.innerHTML = '<div class="text-xs text-slate-400 text-center py-2">No sources tracked yet.</div>';
    } else {
      sourcesList.innerHTML = topSources.slice(0, 4).map(s => `
        <div class="flex items-center justify-between text-xs py-1 border-b border-slate-50 last:border-0">
          <div class="font-medium text-slate-700 truncate max-w-[170px]" title="${escapeHtml(s.name)}">
            ${escapeHtml(s.name)}
          </div>
          <div class="flex items-center space-x-1.5">
            <span class="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-bold text-[10px]">${s.total_agents} agents</span>
            <span class="text-[10px] text-slate-400">(${s.total_ads} ads)</span>
          </div>
        </div>
      `).join('');
    }

    // Render Most Active Agents
    const activeList = document.getElementById('most-active-agents-list');
    if (mostActiveAgents.length === 0) {
      activeList.innerHTML = '<div class="p-6 text-center text-xs text-slate-400">No agent leads found yet. Use Ingestion Studio to import posts.</div>';
    } else {
      activeList.innerHTML = mostActiveAgents.map(a => `
        <div class="p-3.5 hover:bg-slate-50/80 transition-all flex items-center justify-between cursor-pointer" onclick="openAgentDetailModal('${a.id}')">
          <div class="flex items-center space-x-3">
            <div class="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center">
              ${escapeHtml(a.name.slice(0, 2).toUpperCase())}
            </div>
            <div>
              <div class="font-semibold text-slate-900 text-xs">${escapeHtml(a.name)}</div>
              <div class="text-[11px] text-slate-500">${escapeHtml(a.primary_phone)} • ${escapeHtml(a.primary_city || 'Nigeria')}</div>
            </div>
          </div>
          <div class="text-right flex items-center space-x-2">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${getScoreBadgeClass(a.lead_score)}">Score: ${a.lead_score}</span>
            <span class="text-xs font-bold text-slate-700">${a.advertisements_count} ads</span>
          </div>
        </div>
      `).join('');
    }

    // Render Recent Ads Feed
    const feed = document.getElementById('recent-ads-feed');
    if (recentAds.length === 0) {
      feed.innerHTML = '<div class="p-6 text-center text-xs text-slate-400">No advertisements indexed yet.</div>';
    } else {
      feed.innerHTML = recentAds.map(ad => `
        <div class="p-3.5 hover:bg-slate-50/80 transition-all space-y-1.5 cursor-pointer" onclick="openAgentDetailModal('${ad.agent_id}')">
          <div class="flex items-center justify-between">
            <span class="font-bold text-slate-900 text-xs">${escapeHtml(ad.property_type)} • <span class="text-emerald-700 font-extrabold">${ad.rent_amount ? formatNaira(ad.rent_amount) : 'Price on request'}</span></span>
            <span class="text-[10px] text-slate-400">${formatDate(ad.posted_at || ad.collected_at)}</span>
          </div>
          <p class="text-xs text-slate-600 line-clamp-2">${escapeHtml(ad.raw_text)}</p>
          <div class="flex items-center justify-between text-[11px] text-slate-500 pt-1">
            <span>By <strong class="text-slate-700">${escapeHtml(ad.agent_name)}</strong> (${escapeHtml(ad.primary_phone)})</span>
            <span class="text-indigo-600 font-medium">${escapeHtml(ad.neighbourhood || ad.city || '')}</span>
          </div>
        </div>
      `).join('');
    }

    lucide.createIcons();
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

// ==========================================
// 2. AGENTS DIRECTORY & TABLE
// ==========================================
function debounceSearch() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    fetchAgents(1);
  }, 250);
}

async function fetchAgents(page = 1) {
  try {
    currentAgentsPage = page;
    const search = document.getElementById('agent-search-input')?.value || '';
    const city = document.getElementById('agent-filter-city')?.value || '';
    const status = document.getElementById('agent-filter-status')?.value || '';
    const role = document.getElementById('agent-filter-role')?.value || '';
    const min_score = document.getElementById('agent-filter-score')?.value || '0';

    const params = new URLSearchParams({
      search,
      city,
      status,
      role,
      min_score,
      page,
      limit: 15
    });

    const res = await fetch(`/api/agents?${params}`).then(r => r.json());
    if (!res.success) return;

    const { data: agents, pagination } = res;
    const tbody = document.getElementById('agents-table-body');

    if (agents.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="px-4 py-8 text-center text-slate-400">
            No agent leads match your current search/filters.
          </td>
        </tr>
      `;
      document.getElementById('pagination-info').textContent = 'Showing 0 of 0 leads';
      document.getElementById('pagination-controls').innerHTML = '';
      return;
    }

    tbody.innerHTML = agents.map(a => `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="px-4 py-3">
          <div class="font-bold text-slate-900 cursor-pointer hover:text-emerald-700" onclick="openAgentDetailModal('${a.id}')">
            ${escapeHtml(a.name)}
          </div>
          <div class="text-xs text-slate-500 font-mono mt-0.5">${escapeHtml(a.primary_phone)}</div>
        </td>
        <td class="px-4 py-3 text-xs">
          <div class="font-medium text-slate-800">${escapeHtml(a.primary_city || 'Unknown')}</div>
          <div class="text-slate-400">${escapeHtml(a.primary_location || '—')}</div>
        </td>
        <td class="px-4 py-3 text-xs text-slate-700">
          <span class="font-medium">${escapeHtml(a.likely_role)}</span>
        </td>
        <td class="px-4 py-3 text-center font-bold text-slate-800 text-xs">
          ${a.advertisements_count}
        </td>
        <td class="px-4 py-3 text-center">
          <span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${getScoreBadgeClass(a.lead_score)}">
            ${a.lead_score}
          </span>
        </td>
        <td class="px-4 py-3 text-xs">
          <span class="inline-block px-2.5 py-0.5 rounded-full font-semibold ${getStatusBadgeClass(a.status)}">
            ${escapeHtml(a.status)}
          </span>
        </td>
        <td class="px-4 py-3 text-xs text-slate-500">
          ${formatDate(a.last_active_at)}
        </td>
        <td class="px-4 py-3 text-right space-x-1 whitespace-nowrap">
          <button onclick="openAgentDetailModal('${a.id}')" class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900" title="View Details">
            <i data-lucide="eye" class="w-4 h-4"></i>
          </button>
          <a href="https://wa.me/${cleanPhoneForWa(a.whatsapp_phone || a.primary_phone)}" target="_blank" class="inline-block p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 hover:text-emerald-700" title="Chat on WhatsApp">
            <i data-lucide="message-circle" class="w-4 h-4"></i>
          </a>
          <a href="tel:${a.primary_phone}" class="inline-block p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 hover:text-blue-700" title="Call Phone">
            <i data-lucide="phone" class="w-4 h-4"></i>
          </a>
        </td>
      </tr>
    `).join('');

    // Pagination info & controls
    document.getElementById('pagination-info').textContent = `Showing ${agents.length} of ${pagination.total} leads (Page ${pagination.page} of ${pagination.totalPages || 1})`;

    let paginationHtml = '';
    if (pagination.page > 1) {
      paginationHtml += `<button onclick="fetchAgents(${pagination.page - 1})" class="px-2.5 py-1 rounded bg-white border border-slate-200 hover:bg-slate-50">&larr; Prev</button>`;
    }
    if (pagination.page < pagination.totalPages) {
      paginationHtml += `<button onclick="fetchAgents(${pagination.page + 1})" class="px-2.5 py-1 rounded bg-white border border-slate-200 hover:bg-slate-50">Next &rarr;</button>`;
    }
    document.getElementById('pagination-controls').innerHTML = paginationHtml;

    lucide.createIcons();
  } catch (err) {
    console.error('Failed to fetch agents:', err);
  }
}

// ==========================================
// 3. AGENT DETAILS & OUTREACH MODAL
// ==========================================
async function openAgentDetailModal(agentId) {
  try {
    currentAgentDetailId = agentId;
    const res = await fetch(`/api/agents/${agentId}`).then(r => r.json());
    if (!res.success) return;

    const { agent, advertisements, outreachLogs } = res.data;

    document.getElementById('modal-agent-name').textContent = agent.name;
    document.getElementById('modal-agent-avatar').textContent = agent.name.slice(0, 2).toUpperCase();
    document.getElementById('modal-agent-phones').textContent = `${agent.primary_phone} ${agent.secondary_phone ? '• Alt: ' + agent.secondary_phone : ''} • ${agent.primary_city || 'Unknown'}`;
    
    // Status & score badges
    const scoreBadge = document.getElementById('modal-agent-score-badge');
    scoreBadge.textContent = `Score: ${agent.lead_score}/100`;
    scoreBadge.className = `px-2 py-0.5 rounded-full text-xs font-bold ${getScoreBadgeClass(agent.lead_score)}`;

    const statusBadge = document.getElementById('modal-agent-status-badge');
    statusBadge.textContent = agent.status;
    statusBadge.className = `px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusBadgeClass(agent.status)}`;

    document.getElementById('modal-role-text').textContent = agent.likely_role;

    // Score justification breakdown
    let breakdownObj = {};
    try {
      breakdownObj = JSON.parse(agent.score_breakdown || '{}');
    } catch (_) {}

    document.getElementById('modal-score-explanation').innerHTML = `
      <strong>Score Factors:</strong> 
      Volume (+${breakdownObj.volumeScore || 0}), 
      Recency (+${breakdownObj.recencyScore || 0}), 
      Portfolio Diversity (+${breakdownObj.diversityScore || 0}), 
      Contact Completeness (+${breakdownObj.completenessScore || 0}), 
      Target Hub (+${breakdownObj.targetCityScore || 0}).
      <br><span class="text-slate-500">${agent.notes ? 'Notes: ' + escapeHtml(agent.notes) : ''}</span>
    `;

    // WhatsApp & Call Buttons
    const waPhone = cleanPhoneForWa(agent.whatsapp_phone || agent.primary_phone);
    document.getElementById('modal-whatsapp-btn').href = `https://wa.me/${waPhone}?text=${encodeURIComponent(`Hello ${agent.name}, I am reaching out from Locari Nigeria regarding your property listings.`)}`;
    document.getElementById('modal-call-btn').href = `tel:${agent.primary_phone}`;

    // Locari Sync button state
    const syncBtn = document.getElementById('modal-sync-locari-btn');
    if (agent.status === 'Registered on Locari') {
      syncBtn.disabled = true;
      syncBtn.className = 'bg-slate-100 text-slate-400 font-semibold px-3 py-2 rounded-lg text-xs cursor-not-allowed';
      syncBtn.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5 mr-1.5 inline"></i>Registered on Locari';
    } else {
      syncBtn.disabled = false;
      syncBtn.className = 'bg-purple-600 hover:bg-purple-700 text-white font-semibold px-3 py-2 rounded-lg text-xs flex items-center transition-all shadow-sm';
      syncBtn.innerHTML = '<i data-lucide="check-circle" class="w-3.5 h-3.5 mr-1.5 inline"></i>Sync to Locari Platform';
    }

    // Do Not Contact button
    const dncBtn = document.getElementById('modal-dnc-btn');
    if (agent.do_not_contact === 1) {
      dncBtn.className = 'bg-red-600 text-white font-semibold px-3 py-2 rounded-lg text-xs flex items-center transition-all ml-auto';
      dncBtn.innerHTML = '<i data-lucide="ban" class="w-3.5 h-3.5 mr-1.5 inline"></i>On Do-Not-Contact List';
    } else {
      dncBtn.className = 'bg-slate-100 hover:bg-red-50 hover:text-red-700 text-slate-700 font-semibold px-3 py-2 rounded-lg border border-slate-200 text-xs flex items-center transition-all ml-auto';
      dncBtn.innerHTML = '<i data-lucide="ban" class="w-3.5 h-3.5 mr-1.5 inline"></i>Do Not Contact';
    }

    // Render Advertisements
    document.getElementById('modal-ads-count').textContent = advertisements.length;
    const adsContainer = document.getElementById('modal-ads-list');
    if (advertisements.length === 0) {
      adsContainer.innerHTML = '<div class="text-xs text-slate-400 py-2">No advertisements recorded.</div>';
    } else {
      adsContainer.innerHTML = advertisements.map(ad => `
        <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
          <div class="flex items-center justify-between">
            <span class="font-bold text-slate-800">${escapeHtml(ad.property_type)} • <span class="text-emerald-700">${ad.rent_amount ? formatNaira(ad.rent_amount) : 'Price on request'}</span></span>
            <span class="text-[11px] text-slate-400">${formatDate(ad.posted_at || ad.collected_at)}</span>
          </div>
          <p class="text-slate-600 whitespace-pre-wrap font-sans text-xs">${escapeHtml(ad.raw_text)}</p>
          <div class="flex items-center justify-between text-[11px] text-slate-500 pt-1">
            <span>Source: <strong>${escapeHtml(ad.source_name || 'Direct Import')}</strong></span>
            ${ad.original_post_url ? `<a href="${ad.original_post_url}" target="_blank" class="text-emerald-600 hover:underline">View original post &rarr;</a>` : ''}
          </div>
        </div>
      `).join('');
    }

    // Render Outreach Timeline
    const timeline = document.getElementById('modal-outreach-timeline');
    if (outreachLogs.length === 0) {
      timeline.innerHTML = '<div class="text-xs text-slate-400 py-2">No communication logged yet. Use the form above to log calls or chats.</div>';
    } else {
      timeline.innerHTML = outreachLogs.map(log => `
        <div class="p-2.5 bg-slate-50 border-l-2 border-emerald-500 rounded-r-lg space-y-1">
          <div class="flex items-center justify-between text-slate-700 font-semibold text-xs">
            <span>${escapeHtml(log.channel)} • ${escapeHtml(log.outcome)}</span>
            <span class="text-[10px] text-slate-400 font-normal">${formatDate(log.contacted_at)}</span>
          </div>
          <p class="text-slate-600 text-[11px]">${escapeHtml(log.notes || 'No notes')}</p>
          ${log.follow_up_date ? `<div class="text-[10px] text-amber-700 font-medium">Follow-up: ${log.follow_up_date}</div>` : ''}
        </div>
      `).join('');
    }

    openModal('agentDetailModal');
    lucide.createIcons();
  } catch (err) {
    console.error('Failed to open agent detail:', err);
  }
}

// Submit communication log
async function submitOutreachLog() {
  if (!currentAgentDetailId) return;

  const channel = document.getElementById('outreach-channel').value;
  const outcome = document.getElementById('outreach-outcome').value;
  const follow_up_date = document.getElementById('outreach-followup-date').value || null;
  const notes = document.getElementById('outreach-notes').value.trim();

  try {
    const res = await fetch(`/api/agents/${currentAgentDetailId}/outreach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel,
        outcome,
        follow_up_date,
        notes,
        conducted_by: 'Locari Scout'
      })
    }).then(r => r.json());

    if (res.success) {
      showToast('✅ Outreach activity successfully logged!');
      document.getElementById('outreach-notes').value = '';
      openAgentDetailModal(currentAgentDetailId);
      if (currentTab === 'agents') fetchAgents(currentAgentsPage);
      if (currentTab === 'dashboard') fetchDashboardStats();
    } else {
      showToast(res.error || 'Failed to log outreach', 'error');
    }
  } catch (err) {
    showToast('Failed to save outreach log', 'error');
  }
}

// Sync to Locari platform
async function syncCurrentAgentToLocari() {
  if (!currentAgentDetailId) return;
  if (!confirm('Sync this agent directly to Locari platform as a verified registered agent?')) return;

  try {
    const res = await fetch(`/api/locari/sync/${currentAgentDetailId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }).then(r => r.json());

    if (res.success) {
      showToast('🎉 Agent registered and synced to Locari platform!');
      openAgentDetailModal(currentAgentDetailId);
      if (currentTab === 'agents') fetchAgents(currentAgentsPage);
      if (currentTab === 'dashboard') fetchDashboardStats();
    } else {
      showToast(res.error || 'Failed to sync to Locari', 'error');
    }
  } catch (err) {
    showToast('Failed to sync to Locari', 'error');
  }
}

// Toggle Do Not Contact
async function toggleDoNotContact() {
  if (!currentAgentDetailId) return;
  const confirmToggle = confirm('Are you sure you want to toggle the Do-Not-Contact compliance status for this lead?');
  if (!confirmToggle) return;

  try {
    const res = await fetch(`/api/agents/${currentAgentDetailId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ do_not_contact: 1 })
    }).then(r => r.json());

    if (res.success) {
      showToast('Lead marked as Do-Not-Contact');
      openAgentDetailModal(currentAgentDetailId);
      if (currentTab === 'agents') fetchAgents(currentAgentsPage);
    }
  } catch (err) {
    showToast('Failed to update status', 'error');
  }
}

// ==========================================
// 4. INGESTION STUDIO
// ==========================================
function loadSampleListings() {
  const sample = `*DIRECT BRIEF IN OLD BODIJA, IBADAN*
Newly built 2 bedroom flat, all rooms ensuite with visitor toilet.
Fenced & gated, running borehole, pop ceiling, dedicated prepaid meter.
Rent: ₦1,200,000 per annum.
Caution: 100k. Agency & Legal: 10%.
Inspection fee: ₦3,000.
Call or WhatsApp: 0803 123 4567

---

*LEKKI PHASE 1 LUXURY APARTMENT*
Executive 3 bedroom serviced flat with 24/7 power, elevator, and swimming pool.
Rent: 5.5m per annum.
Direct brief.
Contact Agent Segun on 0812 345 6789 or wa.me/2348123456789

---

*DECENT ROOM & PARLOUR AT AKOBO IBADAN*
Decent room and parlour self contain, borehole water, compound fully paved.
Rent: 450k per year.
Inspection fee applies.
Call Realtor Biodun: 0905 555 4433`;

  document.getElementById('quick-paste-text').value = sample;
}

async function previewQuickPaste() {
  const rawText = document.getElementById('quick-paste-text').value.trim();
  const sourceId = document.getElementById('quick-paste-source').value || null;

  if (!rawText) {
    showToast('Please paste at least one property advertisement text.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/ingest/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText, sourceId })
    }).then(r => r.json());

    if (!res.success) {
      showToast(res.error || 'Preview failed', 'error');
      return;
    }

    const { totalSegments, validContactsCount, missingContactsCount, items } = res.data;
    const box = document.getElementById('quick-paste-preview-box');
    const badge = document.getElementById('preview-counts-badge');
    const list = document.getElementById('preview-items-list');

    box.classList.remove('hidden');
    badge.textContent = `${validContactsCount} valid contacts found / ${totalSegments} post(s)`;

    list.innerHTML = items.map((item, idx) => `
      <div class="p-3 rounded-lg border ${item.hasContact ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'} text-xs space-y-1">
        <div class="flex items-center justify-between">
          <span class="font-bold text-slate-800">#${idx + 1}: ${escapeHtml(item.propertyType)}</span>
          <span class="font-bold ${item.hasContact ? 'text-emerald-700' : 'text-amber-700'}">
            ${item.hasContact ? 'Phone: ' + item.primaryPhone : '⚠️ No Phone Found'}
          </span>
        </div>
        <div class="text-slate-600">
          Location: <strong>${escapeHtml(item.neighbourhood ? item.neighbourhood + ', ' + item.city : item.city)}</strong> • 
          Rent: <strong>${item.rentAmount ? formatNaira(item.rentAmount) : 'Unspecified'}</strong>
        </div>
      </div>
    `).join('');

    lucide.createIcons();
  } catch (err) {
    showToast('Error generating preview', 'error');
  }
}

async function submitQuickPaste() {
  const rawText = document.getElementById('quick-paste-text').value.trim();
  const sourceId = document.getElementById('quick-paste-source').value || null;

  if (!rawText) {
    showToast('Please paste post text to ingest.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/ingest/quick-paste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText, sourceId })
    }).then(r => r.json());

    if (res.success) {
      const { postsImported, duplicatesDetected, agentsCreated, agentsUpdated } = res.data;
      showToast(`✅ Ingested ${postsImported} posts! Created ${agentsCreated} new agents, updated ${agentsUpdated}. (${duplicatesDetected} duplicates ignored).`);
      document.getElementById('quick-paste-text').value = '';
      document.getElementById('quick-paste-preview-box').classList.add('hidden');
      fetchDashboardStats();
    } else {
      showToast(res.error || 'Ingestion failed', 'error');
    }
  } catch (err) {
    showToast('Ingestion error', 'error');
  }
}

// Modal Quick Post (single post)
async function submitModalQuickPost() {
  const rawText = document.getElementById('modal-quick-text').value.trim();
  const posterName = document.getElementById('modal-quick-name').value.trim() || undefined;
  const originalPostUrl = document.getElementById('modal-quick-url').value.trim() || undefined;

  if (!rawText) {
    showToast('Post text is required', 'error');
    return;
  }

  try {
    const res = await fetch('/api/ingest/single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawText,
        posterName,
        originalPostUrl,
        method: 'Manual'
      })
    }).then(r => r.json());

    if (res.success && res.data.postsImported > 0) {
      showToast('✅ Post successfully ingested!');
      closeModal('quickIngestModal');
      document.getElementById('modal-quick-text').value = '';
      fetchDashboardStats();
      if (currentTab === 'agents') fetchAgents(currentAgentsPage);
    } else {
      showToast(res.data?.errors?.[0]?.reason || 'Could not find a valid Nigerian phone number in post', 'error');
    }
  } catch (err) {
    showToast('Failed to ingest post', 'error');
  }
}

// Fetch Browser Bookmarklet code
async function fetchBookmarklet() {
  try {
    const res = await fetch('/api/clipper/bookmarklet').then(r => r.json());
    if (res.success) {
      const link = document.getElementById('bookmarklet-link');
      if (link) {
        link.href = res.data.bookmarkletCode;
      }
    }
  } catch (err) {
    console.error('Bookmarklet fetch error:', err);
  }
}

// CSV Handlers
function handleCsvFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('csv-paste-text').value = e.target.result;
  };
  reader.readAsText(file);
}

async function submitCsvIngest() {
  const csvContent = document.getElementById('csv-paste-text').value.trim();
  if (!csvContent) {
    showToast('Please provide CSV content to import.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/ingest/csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvContent })
    }).then(r => r.json());

    if (res.success) {
      showToast(`✅ CSV imported! ${res.data.postsImported} listings processed.`);
      document.getElementById('csv-paste-text').value = '';
      fetchDashboardStats();
    } else {
      showToast(res.error || 'CSV import failed', 'error');
    }
  } catch (err) {
    showToast('CSV import error', 'error');
  }
}

// ==========================================
// 5. SOURCES MANAGEMENT
// ==========================================
async function fetchSources() {
  try {
    const res = await fetch('/api/sources').then(r => r.json());
    if (!res.success) return;

    const sources = res.data;

    // Populate quick-paste dropdown
    const select = document.getElementById('quick-paste-source');
    if (select) {
      select.innerHTML = '<option value="">Select Source (Optional)</option>' +
        sources.map(s => `<option value="${s.id}">${escapeHtml(s.name)} (${s.location_covered})</option>`).join('');
    }

    // Render Sources Cards in Sources Tab
    const grid = document.getElementById('sources-cards-grid');
    if (grid) {
      grid.innerHTML = sources.map(s => `
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div class="flex items-start justify-between">
            <div>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">${escapeHtml(s.platform)}</span>
              <h4 class="font-bold text-slate-900 text-sm mt-1">${escapeHtml(s.name)}</h4>
              <p class="text-xs text-slate-500">${escapeHtml(s.location_covered)} • ${escapeHtml(s.source_type)}</p>
            </div>
          </div>
          <div class="p-3 rounded-lg bg-slate-50 flex items-center justify-between text-xs">
            <div>
              <span class="text-slate-400">Agents Found:</span>
              <strong class="text-slate-800 ml-1">${s.total_agents || 0}</strong>
            </div>
            <div>
              <span class="text-slate-400">Posts:</span>
              <strong class="text-slate-800 ml-1">${s.total_ads || 0}</strong>
            </div>
          </div>
          <div class="flex items-center justify-between text-xs pt-1">
            <span class="text-[11px] text-slate-400">Method: ${escapeHtml(s.collection_method)}</span>
            ${s.group_url ? `<a href="${s.group_url}" target="_blank" class="text-emerald-600 hover:underline flex items-center">Open Group &rarr;</a>` : ''}
          </div>
        </div>
      `).join('');
    }

    lucide.createIcons();
  } catch (err) {
    console.error('Failed to fetch sources:', err);
  }
}

async function submitAddSource() {
  const name = document.getElementById('source-name-input').value.trim();
  const platform = document.getElementById('source-platform-input').value;
  const location_covered = document.getElementById('source-location-input').value.trim() || 'Ibadan';
  const group_url = document.getElementById('source-url-input').value.trim() || null;
  const collection_method = document.getElementById('source-method-input').value;

  if (!name) {
    showToast('Source name is required', 'error');
    return;
  }

  try {
    const res = await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        platform,
        location_covered,
        group_url,
        collection_method
      })
    }).then(r => r.json());

    if (res.success) {
      showToast('✅ Discovery source created!');
      closeModal('addSourceModal');
      document.getElementById('source-name-input').value = '';
      fetchSources();
    }
  } catch (err) {
    showToast('Failed to add source', 'error');
  }
}

// ==========================================
// 6. OUTREACH FOLLOW-UPS
// ==========================================
async function fetchFollowups() {
  try {
    const res = await fetch('/api/outreach/pending-followups').then(r => r.json());
    if (!res.success) return;

    const followups = res.data;
    const badge = document.getElementById('followup-count-badge');
    const container = document.getElementById('followups-list');

    badge.textContent = `${followups.length} pending`;

    if (followups.length === 0) {
      container.innerHTML = '<div class="p-6 text-center text-xs text-slate-400">No overdue follow-ups right now. Keep reaching out to new leads!</div>';
      return;
    }

    container.innerHTML = followups.map(f => `
      <div class="p-4 flex items-center justify-between hover:bg-slate-50 transition-all">
        <div>
          <div class="font-bold text-slate-900 text-xs flex items-center space-x-2">
            <span>${escapeHtml(f.agent_name)}</span>
            <span class="text-slate-400 font-normal">(${escapeHtml(f.primary_phone)})</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">Due: ${f.follow_up_date}</span>
          </div>
          <p class="text-xs text-slate-600 mt-1">${escapeHtml(f.notes || 'Scheduled follow-up')}</p>
        </div>
        <button onclick="openAgentDetailModal('${f.agent_id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-3 py-1.5 rounded-lg text-xs">
          Open Lead
        </button>
      </div>
    `).join('');

    lucide.createIcons();
  } catch (err) {
    console.error('Failed to fetch followups:', err);
  }
}

// ==========================================
// 7. MERGE AGENTS
// ==========================================
async function submitAgentMerge() {
  const targetAgentId = document.getElementById('merge-target-id').value.trim();
  const sourceAgentId = document.getElementById('merge-source-id').value.trim();

  if (!targetAgentId || !sourceAgentId) {
    showToast('Please provide both Agent IDs', 'error');
    return;
  }

  try {
    const res = await fetch('/api/agents/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceAgentId, targetAgentId })
    }).then(r => r.json());

    if (res.success) {
      showToast('✅ Agents successfully merged!');
      closeModal('mergeModal');
      document.getElementById('merge-target-id').value = '';
      document.getElementById('merge-source-id').value = '';
      fetchAgents(currentAgentsPage);
      fetchDashboardStats();
    } else {
      showToast(res.error || 'Merge failed', 'error');
    }
  } catch (err) {
    showToast('Merge error', 'error');
  }
}

// ==========================================
// 8. CSV EXPORT
// ==========================================
function exportAgentsCsv() {
  const city = document.getElementById('agent-filter-city')?.value || '';
  const status = document.getElementById('agent-filter-status')?.value || '';
  const min_score = document.getElementById('agent-filter-score')?.value || '0';

  const params = new URLSearchParams({ city, status, min_score });
  window.location.href = `/api/export/csv?${params.toString()}`;
}

// ==========================================
// UTILITY HELPERS
// ==========================================
function formatNaira(amount) {
  if (!amount) return '₦0';
  return '₦' + Number(amount).toLocaleString();
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) {
    return isoStr;
  }
}

function cleanPhoneForWa(phone) {
  if (!phone) return '';
  return phone.replace(/[^\d]/g, '');
}

function getScoreBadgeClass(score) {
  if (score >= 70) return 'score-badge-high';
  if (score >= 45) return 'score-badge-medium';
  return 'score-badge-low';
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'New': return 'status-badge-new';
    case 'Qualified': return 'status-badge-qualified';
    case 'Contacted': return 'status-badge-contacted';
    case 'Interested': return 'status-badge-interested';
    case 'Registered on Locari': return 'status-badge-registered';
    case 'Do Not Contact': return 'status-badge-dnc';
    default: return 'bg-slate-100 text-slate-700';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================
// 9. AUTOMATED SCRAPER CONTROLLER
// ==========================================
let scraperPollInterval = null;

/**
 * Intelligent Facebook URL Sanitizer
 * Automatically strips accidental text prefixes, duplicate protocols (e.g. https://wehttps://...),
 * and extracts the clean Facebook group or share link.
 */
function sanitizeFacebookGroupUrl(input) {
  if (!input) return '';
  let str = String(input).trim();

  // 1. Recover from accidental multi-paste or nested protocol (e.g. https://wehttps://web.facebook.com...)
  const embeddedProtocol = str.match(/https?:\/\/[a-z0-9._-]*?(https?:\/\/[^\s"']+)/i);
  if (embeddedProtocol) {
    str = embeddedProtocol[1];
  }

  // 2. Extract clean Facebook Share Link (e.g. https://www.facebook.com/share/g/1HZ7NoRtjM/)
  const shareMatch = str.match(/https?:\/\/(?:[a-zA-Z0-9-]+\.)*facebook\.com\/share\/g\/([a-zA-Z0-9_-]+)/i);
  if (shareMatch) {
    return `https://www.facebook.com/share/g/${shareMatch[1]}/`;
  }

  // 3. Extract clean Facebook Group Link (e.g. https://www.facebook.com/groups/320272456356519/)
  const groupMatch = str.match(/https?:\/\/(?:[a-zA-Z0-9-]+\.)*facebook\.com\/groups\/([a-zA-Z0-9._-]+)/i);
  if (groupMatch) {
    const groupId = groupMatch[1];
    if (groupId !== 'joins' && groupId !== 'feed' && groupId !== 'discover') {
      return `https://www.facebook.com/groups/${groupId}/`;
    }
  }

  // 4. Fallback: if valid URL on facebook.com
  try {
    const u = new URL(str);
    if (u.hostname.includes('facebook.com')) {
      return str;
    }
  } catch (_) {}

  return str;
}

function autoCleanScraperGroupUrl(el) {
  if (!el || !el.value) return;
  const raw = el.value.trim();
  if (raw.includes('facebook.com')) {
    const cleaned = sanitizeFacebookGroupUrl(raw);
    if (cleaned && cleaned !== raw) {
      el.value = cleaned;
    }
  }
}

function clearGroupUrl() {
  const input = document.getElementById('scraper-group-url');
  if (input) {
    input.value = '';
    input.focus();
    showToast('Group URL cleared');
  }
}

function setGroupUrl(url) {
  const input = document.getElementById('scraper-group-url');
  if (input) {
    input.value = sanitizeFacebookGroupUrl(url);
    input.classList.add('ring-2', 'ring-blue-500');
    setTimeout(() => input.classList.remove('ring-2', 'ring-blue-500'), 800);
    showToast('Group URL selected!');
  }
}

async function pasteClipboardToGroupUrl() {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        const input = document.getElementById('scraper-group-url');
        if (input) {
          const cleaned = sanitizeFacebookGroupUrl(text.trim());
          input.value = cleaned;
          showToast('Pasted & verified clean Facebook URL!');
          return;
        }
      }
    }
    const input = document.getElementById('scraper-group-url');
    if (input) {
      input.value = '';
      input.focus();
      showToast('Press Ctrl+V to paste your group link', 'info');
    }
  } catch (_) {
    const input = document.getElementById('scraper-group-url');
    if (input) {
      input.value = '';
      input.focus();
    }
    showToast('Press Ctrl+V to paste into the URL field', 'info');
  }
}

function sanitizePortalUrl(input) {
  if (!input) return '';
  let str = String(input).trim();
  const embeddedProtocol = str.match(/https?:\/\/[a-z0-9._-]*?(https?:\/\/[^\s"']+)/i);
  if (embeddedProtocol) {
    str = embeddedProtocol[1];
  }
  return str;
}

function autoCleanPortalUrl(el) {
  if (!el || !el.value) return;
  const raw = el.value.trim();
  if (raw.includes('propertypro.ng') || raw.includes('nigeriapropertycentre.com')) {
    const cleaned = sanitizePortalUrl(raw);
    if (cleaned && cleaned !== raw) {
      el.value = cleaned;
    }
  }
}

function clearPortalUrl() {
  const input = document.getElementById('scraper-portal-url');
  if (input) {
    input.value = '';
    input.focus();
    showToast('Portal URL cleared');
  }
}

function setPortalUrl(url) {
  const input = document.getElementById('scraper-portal-url');
  if (input) {
    input.value = sanitizePortalUrl(url);
    showToast('Portal URL selected!');
  }
}

async function pasteClipboardToPortalUrl() {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        const input = document.getElementById('scraper-portal-url');
        if (input) {
          input.value = sanitizePortalUrl(text.trim());
          showToast('Pasted portal URL from clipboard!');
          return;
        }
      }
    }
    const input = document.getElementById('scraper-portal-url');
    if (input) {
      input.value = '';
      input.focus();
    }
    showToast('Press Ctrl+V to paste portal URL', 'info');
  } catch (_) {
    const input = document.getElementById('scraper-portal-url');
    if (input) {
      input.value = '';
      input.focus();
    }
    showToast('Press Ctrl+V to paste portal URL', 'info');
  }
}

async function checkFacebookSessionStatus() {
  try {
    const res = await fetch('/api/scraper/status').then(r => r.json());
    if (!res.success) return;
    const { profile } = res.data;
    const badge = document.getElementById('fb-session-badge');
    if (badge) {
      if (profile.hasUserSession) {
        badge.className = 'px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 flex items-center';
        badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 mr-2"></span><span>Connected (ID: ${profile.userId || 'Active'})</span>`;
      } else {
        badge.className = 'px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/20 border border-amber-500/30 text-amber-300 flex items-center';
        badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400 mr-2"></span><span>Public Mode (Ready)</span>`;
      }
    }
  } catch (_) {}
}

async function launchFacebookLoginWindow() {
  try {
    showToast('🚀 Launching Chrome login window... Please log into Facebook.', 'info');
    const res = await fetch('/api/scraper/launch-login', { method: 'POST' }).then(r => r.json());
    if (res.success) {
      startScraperPolling();
      // Poll session status periodically to detect when user logs in
      const pollTimer = setInterval(async () => {
        await checkFacebookSessionStatus();
        const badge = document.getElementById('fb-session-badge');
        if (badge && badge.textContent.includes('Connected')) {
          clearInterval(pollTimer);
          showToast('🎉 Facebook account connected! You can now scrape any group with full access.');
        }
      }, 3000);
      setTimeout(() => clearInterval(pollTimer), 180000);
    }
  } catch (err) {
    showToast('Error opening login window: ' + err.message, 'error');
  }
}

async function saveFacebookCookiesAction() {
  const input = document.getElementById('modal-fb-cookies-input')?.value.trim();
  if (!input) {
    showToast('Please paste your Facebook cookies (c_user and xs)', 'error');
    return;
  }
  try {
    const res = await fetch('/api/scraper/cookies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookies: input })
    }).then(r => r.json());

    if (res.success) {
      showToast('✅ Facebook session cookies saved! Scraper is authenticated.');
      closeModal('facebookSessionModal');
      checkFacebookSessionStatus();
    } else {
      showToast(res.error || 'Failed to save cookies', 'error');
    }
  } catch (err) {
    showToast('Network error saving cookies', 'error');
  }
}

async function clearFacebookCookiesAction() {
  try {
    await fetch('/api/scraper/cookies', { method: 'DELETE' });
    showToast('Cookies cleared. Returned to public visitor mode.');
    const input = document.getElementById('modal-fb-cookies-input');
    if (input) input.value = '';
    closeModal('facebookSessionModal');
    checkFacebookSessionStatus();
  } catch (err) {
    showToast('Error removing cookies', 'error');
  }
}

async function startFacebookGroupScrape() {
  const rawGroupUrl = document.getElementById('scraper-group-url')?.value.trim();
  const maxPosts = document.getElementById('scraper-max-posts')?.value || '30';
  const maxScrolls = document.getElementById('scraper-max-scrolls')?.value || '10';
  const browserMode = document.getElementById('scraper-browser-mode')?.value || 'headless';

  const groupUrl = sanitizeFacebookGroupUrl(rawGroupUrl);
  const inputEl = document.getElementById('scraper-group-url');
  if (inputEl && groupUrl) {
    inputEl.value = groupUrl;
  }

  if (!groupUrl || !groupUrl.includes('facebook.com') || (!groupUrl.includes('/groups/') && !groupUrl.includes('/share/g/'))) {
    showToast('Please enter a valid Facebook Group URL (e.g. https://www.facebook.com/groups/... or https://web.facebook.com/share/g/...)', 'error');
    if (inputEl) inputEl.focus();
    return;
  }

  try {
    const btn = document.getElementById('btn-start-fb-scrape');
    if (btn) {
      btn.disabled = true;
      btn.classList.add('opacity-50');
      btn.innerHTML = '<i data-lucide="loader" class="w-5 h-5 mr-2 animate-spin"></i><span>Scraping Facebook Group...</span>';
      lucide.createIcons();
    }

    const res = await fetch('/api/scraper/start-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupUrl,
        maxPosts: parseInt(maxPosts, 10),
        maxScrolls: parseInt(maxScrolls, 10),
        headless: browserMode === 'headless'
      })
    }).then(r => r.json());

    if (res.success) {
      showToast('🚀 Scraper running! Watching live feed in console below...');
      startScraperPolling();
    } else {
      showToast(res.error || 'Failed to start scrape', 'error');
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('opacity-50');
        btn.innerHTML = '<i data-lucide="play" class="w-5 h-5 mr-2"></i><span>Start Scraping Facebook Group & Extract Agents</span>';
        lucide.createIcons();
      }
    }
  } catch (err) {
    showToast('Network error starting scrape', 'error');
    const btn = document.getElementById('btn-start-fb-scrape');
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('opacity-50');
      btn.innerHTML = '<i data-lucide="play" class="w-5 h-5 mr-2"></i><span>Start Scraping Facebook Group & Extract Agents</span>';
      lucide.createIcons();
    }
  }
}

async function pasteClipboardToPortalUrl() {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        const input = document.getElementById('scraper-portal-url');
        if (input) {
          input.value = text.trim();
          showToast('Pasted portal URL from clipboard!');
          return;
        }
      }
    }
    const input = document.getElementById('scraper-portal-url');
    if (input) {
      input.focus();
      input.select();
      showToast('Press Ctrl+V to paste your link', 'info');
    }
  } catch (_) {
    const input = document.getElementById('scraper-portal-url');
    if (input) input.focus();
    showToast('Press Ctrl+V to paste into the URL field', 'info');
  }
}

async function confirmResetDatabase() {
  if (!confirm('⚠️ Are you sure you want to delete ALL discovered leads and start completely fresh? This will wipe the database to 0 records.')) {
    return;
  }
  try {
    const res = await fetch('/api/database/reset', { method: 'POST' }).then(r => r.json());
    if (res.success) {
      showToast('🗑️ Database wiped clean! All test and agent records deleted.');
      fetchDashboardStats();
      fetchQuickScraperResults();
      if (currentTab === 'agents') fetchAgents(1);
      if (currentTab === 'outreach') fetchFollowups();
    } else {
      showToast(res.error || 'Failed to reset database', 'error');
    }
  } catch (err) {
    showToast('Error resetting database: ' + err.message, 'error');
  }
}

async function startPortalScrape() {
  const portalUrl = document.getElementById('scraper-portal-url')?.value.trim();
  const maxPages = document.getElementById('scraper-portal-pages')?.value || '1';
  const browserMode = document.getElementById('scraper-portal-mode')?.value || 'headless';

  if (!portalUrl) {
    showToast('Please enter a property portal URL', 'error');
    return;
  }

  try {
    const btn = document.getElementById('btn-start-portal-scrape');
    if (btn) {
      btn.disabled = true;
      btn.classList.add('opacity-50');
      btn.innerHTML = '<i data-lucide="loader" class="w-5 h-5 mr-2 animate-spin"></i><span>Scraping Property Portal...</span>';
      lucide.createIcons();
    }

    const res = await fetch('/api/scraper/start-portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portalUrl,
        maxPages: parseInt(maxPages, 10),
        headless: browserMode === 'headless'
      })
    }).then(r => r.json());

    if (res.success) {
      showToast('🚀 Portal scraper started! Monitoring logs below...');
      startScraperPolling();
    } else {
      showToast(res.error || 'Failed to start portal scrape', 'error');
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('opacity-50');
        btn.innerHTML = '<i data-lucide="play" class="w-5 h-5 mr-2"></i><span>Scrape Property Portal & Extract Agent Phones</span>';
        lucide.createIcons();
      }
    }
  } catch (err) {
    showToast('Error starting portal scrape', 'error');
    const btn = document.getElementById('btn-start-portal-scrape');
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('opacity-50');
      btn.innerHTML = '<i data-lucide="play" class="w-5 h-5 mr-2"></i><span>Scrape Property Portal & Extract Agent Phones</span>';
      lucide.createIcons();
    }
  }
}

async function stopActiveScrape() {
  try {
    showToast('Stopping scrape session and releasing browser...');
    await fetch('/api/scraper/stop', { method: 'POST' });
    const badge = document.getElementById('terminal-status-badge');
    if (badge) {
      badge.textContent = 'Stopping...';
      badge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400';
    }
    const portalBadge = document.getElementById('portal-terminal-status');
    if (portalBadge) {
      portalBadge.textContent = 'Stopping...';
      portalBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400';
    }
  } catch (_) {}
}

function startScraperPolling() {
  if (scraperPollInterval) clearInterval(scraperPollInterval);
  scraperPollInterval = setInterval(pollScraperStatus, 1500);
  pollScraperStatus();
}

async function fetchQuickScraperResults() {
  try {
    const res = await fetch('/api/agents?limit=10&sort_by=last_active_at&sort_order=DESC').then(r => r.json());
    if (!res.success) return;

    const tbody = document.getElementById('scraper-quick-results-body');
    const portalTbody = document.getElementById('portal-quick-results-body');
    const agents = res.data || [];

    const emptyRow = `
      <tr>
        <td colspan="6" class="px-4 py-8 text-center text-slate-400 text-xs">
          No agent leads in database yet. Run a scraper above to extract live leads!
        </td>
      </tr>
    `;

    const html = agents.length === 0 ? emptyRow : agents.map(a => `
      <tr class="hover:bg-slate-50 transition-colors text-xs">
        <td class="px-4 py-3 font-bold text-slate-900">
          <span class="cursor-pointer hover:text-blue-600" onclick="openAgentDetailModal('${a.id}')">${escapeHtml(a.name)}</span>
        </td>
        <td class="px-4 py-3 font-mono text-emerald-700 font-bold">
          ${escapeHtml(a.primary_phone)}
        </td>
        <td class="px-4 py-3 text-slate-700">
          ${escapeHtml(a.primary_location ? a.primary_location + ', ' + a.primary_city : (a.primary_city || 'Nigeria'))}
        </td>
        <td class="px-4 py-3 text-slate-600">
          ${escapeHtml(a.likely_role)}
        </td>
        <td class="px-4 py-3 text-center">
          <span class="px-2 py-0.5 rounded-full font-bold ${getScoreBadgeClass(a.lead_score)}">
            ${a.lead_score}
          </span>
        </td>
        <td class="px-4 py-3 text-right space-x-1 whitespace-nowrap">
          <a href="https://wa.me/${cleanPhoneForWa(a.whatsapp_phone || a.primary_phone)}" target="_blank" class="inline-flex items-center px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold" title="Chat on WhatsApp">
            <i data-lucide="message-circle" class="w-3.5 h-3.5 mr-1"></i>WhatsApp
          </a>
          <a href="tel:${a.primary_phone}" class="inline-flex items-center px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold" title="Call">
            <i data-lucide="phone" class="w-3.5 h-3.5 mr-1"></i>Call
          </a>
        </td>
      </tr>
    `).join('');

    if (tbody) tbody.innerHTML = html;
    if (portalTbody) portalTbody.innerHTML = html;

    lucide.createIcons();
  } catch (err) {
    console.error('Error fetching quick scraper results:', err);
  }
}

let scannedJoinedGroupsList = [];

async function scanMyJoinedGroups() {
  const btn = document.getElementById('btn-scan-groups');
  const box = document.getElementById('scanned-groups-box');
  const list = document.getElementById('scanned-groups-list');

  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 mr-1.5 animate-spin"></i>Scanning Chrome for Groups...';
    }

    showToast('Opening Chrome to scan groups your account follows...', 'info');

    const res = await fetch('/api/scraper/my-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headless: true })
    }).then(r => r.json());

    if (!res.success) {
      showToast(res.error || 'Failed to scan groups. Please log in first.', 'error');
      return;
    }

    scannedJoinedGroupsList = res.data || [];
    if (scannedJoinedGroupsList.length === 0) {
      showToast('No groups found. Please ensure your Facebook account is logged in.');
      return;
    }

    box.classList.remove('hidden');
    list.innerHTML = scannedJoinedGroupsList.map((g, idx) => `
      <label class="flex items-start space-x-2 p-2 rounded-lg hover:bg-white bg-slate-50 border border-slate-200 cursor-pointer">
        <input type="checkbox" class="scanned-group-chk mt-0.5 rounded text-blue-600 focus:ring-blue-500" value="${escapeHtml(g.url)}" checked>
        <span class="font-medium text-slate-800 text-[11px] leading-snug">${escapeHtml(g.name)}</span>
      </label>
    `).join('');

    showToast(`✅ Found ${scannedJoinedGroupsList.length} groups you follow on Facebook!`);
    lucide.createIcons();
  } catch (err) {
    showToast('Failed to scan groups: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="list" class="w-3.5 h-3.5 mr-1.5"></i>Scan Groups I Follow';
      lucide.createIcons();
    }
  }
}

function selectAllScannedGroups(val) {
  document.querySelectorAll('.scanned-group-chk').forEach(c => c.checked = val);
}

async function scrapeSelectedJoinedGroups() {
  const checked = Array.from(document.querySelectorAll('.scanned-group-chk:checked')).map(c => c.value);
  if (checked.length === 0) {
    showToast('Please check at least one group to scrape.', 'error');
    return;
  }

  const browserMode = document.getElementById('scraper-browser-mode')?.value || 'visible';

  try {
    const res = await fetch('/api/scraper/start-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupUrls: checked,
        maxPosts: 25,
        maxScrolls: 8,
        headless: browserMode === 'headless'
      })
    }).then(r => r.json());

    if (res.success) {
      showToast(`🚀 Started scraping ${checked.length} selected groups! Monitoring live terminal...`);
      startScraperPolling();
    } else {
      showToast(res.error || 'Failed to start batch scrape', 'error');
    }
  } catch (err) {
    showToast('Batch scrape error', 'error');
  }
}

async function pollScraperStatus() {
  try {
    const res = await fetch('/api/scraper/status').then(r => r.json());
    if (!res.success) return;

    const { activeJob } = res.data;

    // Facebook console elements
    const badge = document.getElementById('terminal-status-badge');
    const postsCount = document.getElementById('terminal-posts-count');
    const phonesCount = document.getElementById('terminal-phones-count');
    const logsWindow = document.getElementById('terminal-logs-window');
    const btnFb = document.getElementById('btn-start-fb-scrape');

    // Portal console elements
    const portalBadge = document.getElementById('portal-terminal-status');
    const portalPostsCount = document.getElementById('portal-posts-count');
    const portalPhonesCount = document.getElementById('portal-phones-count');
    const portalLogsWindow = document.getElementById('portal-logs-window');
    const btnPortal = document.getElementById('btn-start-portal-scrape');

    if (postsCount) postsCount.textContent = activeJob.postsFound || 0;
    if (phonesCount) phonesCount.textContent = activeJob.phonesFound || 0;
    if (portalPostsCount) portalPostsCount.textContent = activeJob.postsFound || 0;
    if (portalPhonesCount) portalPhonesCount.textContent = activeJob.phonesFound || 0;

    if (activeJob.running) {
      if (badge) {
        badge.textContent = 'Scraping in progress...';
        badge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 animate-pulse';
      }
      if (portalBadge) {
        portalBadge.textContent = 'Scraping in progress...';
        portalBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 animate-pulse';
      }
    } else {
      const statusText = activeJob.error ? 'Error / Interrupted' : 'Idle / Completed';
      const statusBg = activeJob.error ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-400';

      if (badge) {
        badge.textContent = statusText;
        badge.className = `px-2 py-0.5 rounded text-[10px] font-bold ${statusBg}`;
      }
      if (portalBadge) {
        portalBadge.textContent = statusText;
        portalBadge.className = `px-2 py-0.5 rounded text-[10px] font-bold ${statusBg}`;
      }

      if (btnFb) {
        btnFb.disabled = false;
        btnFb.classList.remove('opacity-50');
        btnFb.innerHTML = '<i data-lucide="play" class="w-5 h-5 mr-2"></i><span>Start Scraping Facebook Group & Extract Agents</span>';
        lucide.createIcons();
      }
      if (btnPortal) {
        btnPortal.disabled = false;
        btnPortal.classList.remove('opacity-50');
        btnPortal.innerHTML = '<i data-lucide="play" class="w-5 h-5 mr-2"></i><span>Scrape Property Portal & Extract Agent Phones</span>';
        lucide.createIcons();
      }

      if (scraperPollInterval && !activeJob.running) {
        clearInterval(scraperPollInterval);
        scraperPollInterval = null;
        if (activeJob.completedSummary) {
          showToast(`🎉 Scrape completed! Discovered ${activeJob.completedSummary.agentsCreated || 0} new agents.`);
          fetchDashboardStats();
          fetchQuickScraperResults();
          if (currentTab === 'agents') fetchAgents(currentAgentsPage);
        }
      }
    }

    if (activeJob.logs && activeJob.logs.length > 0) {
      const logsHtml = activeJob.logs.map(line => {
        const isErr = line.includes('❌') || line.includes('Error');
        const isWarn = line.includes('⚠️');
        const color = isErr ? 'text-red-400' : (isWarn ? 'text-amber-400' : 'text-emerald-400');
        return `<div class="${color}">${escapeHtml(line)}</div>`;
      }).join('');

      if (logsWindow) {
        logsWindow.innerHTML = logsHtml;
        logsWindow.scrollTop = logsWindow.scrollHeight;
      }
      if (portalLogsWindow) {
        portalLogsWindow.innerHTML = logsHtml;
        portalLogsWindow.scrollTop = portalLogsWindow.scrollHeight;
      }
    }
  } catch (err) {
    console.error('Polling error:', err);
  }
}

// Initial status check on load
document.addEventListener('DOMContentLoaded', () => {
  fetch('/api/scraper/status')
    .then(r => r.json())
    .then(res => {
      if (res.success && res.data.activeJob?.running) {
        startScraperPolling();
      }
    })
    .catch(() => {});
});
