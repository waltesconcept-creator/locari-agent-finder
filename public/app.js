/**
 * Locarie Agent Finder - Production Web Application Script
 * Full-stack Facebook Group Scraper, Direct Ingest & Leads CRM
 */

// Global State
let currentMainTab = 'scraper';
let currentLeadsPage = 1;
let leadSearchDebounceTimer = null;
let scraperPollingInterval = null;
let cachedLeads = [];

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // 1. Initial UI environment setup
  initEnvironmentAwareness();

  // 2. Fetch Facebook session status
  checkFacebookSessionStatus();

  // 3. Fetch initial leads and update CRM badge count
  fetchLeads(1);

  // 4. Check if a scraper is already running in background
  checkExistingScraperJob();

  // 5. Initialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
});

function initEnvironmentAwareness() {
  const isCloudHost = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
  if (isCloudHost) {
    const optVisible = document.getElementById('opt-visible-window');
    if (optVisible) {
      optVisible.disabled = true;
      optVisible.textContent = 'Visible Window (Localhost Only)';
    }
    const selectMode = document.getElementById('scraper-browser-mode');
    if (selectMode) {
      selectMode.value = 'headless';
    }
  }
}

// ==========================================
// TOAST NOTIFICATIONS & UTILITIES
// ==========================================
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bg = type === 'success' ? 'bg-emerald-700 text-white' : 
             type === 'error' ? 'bg-red-700 text-white' : 
             type === 'info' ? 'bg-blue-700 text-white' : 'bg-slate-800 text-white';

  toast.className = `${bg} px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold flex items-center space-x-2 transition-all duration-200 transform translate-y-2 pointer-events-auto border border-white/10`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-4');
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return isoStr;
  }
}

/**
 * Robust Facebook Group URL Sanitizer:
 * Cleans double-pasting or accidental prefixes like https://wehttps://...
 */
function sanitizeFacebookGroupUrl(input) {
  if (!input) return '';
  let str = String(input).trim();

  // Recover from accidental nested protocol
  const embeddedProtocol = str.match(/https?:\/\/[a-z0-9._-]*?(https?:\/\/[^\s"']+)/i);
  if (embeddedProtocol) {
    str = embeddedProtocol[1];
  }

  // Extract clean Facebook share group link
  const shareMatch = str.match(/https?:\/\/(?:[a-zA-Z0-9-]+\.)*facebook\.com\/share\/g\/([a-zA-Z0-9_-]+)/i);
  if (shareMatch) {
    return `https://www.facebook.com/share/g/${shareMatch[1]}/`;
  }

  // Extract clean Facebook group link
  const groupMatch = str.match(/https?:\/\/(?:[a-zA-Z0-9-]+\.)*facebook\.com\/groups\/([a-zA-Z0-9._-]+)/i);
  if (groupMatch) {
    const groupId = groupMatch[1];
    if (groupId !== 'joins' && groupId !== 'feed' && groupId !== 'discover') {
      return `https://www.facebook.com/groups/${groupId}/`;
    }
  }

  return str;
}

// ==========================================
// NAVIGATION (TAB SWITCHING)
// ==========================================
function switchMainTab(tabName) {
  currentMainTab = tabName;

  const btnScraper = document.getElementById('nav-scraper');
  const btnLeads = document.getElementById('nav-leads');
  const paneScraper = document.getElementById('tab-scraper');
  const paneLeads = document.getElementById('tab-leads');

  if (tabName === 'scraper') {
    if (btnScraper) btnScraper.classList.add('active');
    if (btnLeads) btnLeads.classList.remove('active');
    if (paneScraper) paneScraper.classList.remove('hidden');
    if (paneLeads) paneLeads.classList.add('hidden');
  } else if (tabName === 'leads') {
    if (btnLeads) btnLeads.classList.add('active');
    if (btnScraper) btnScraper.classList.remove('active');
    if (paneLeads) paneLeads.classList.remove('hidden');
    if (paneScraper) paneScraper.classList.add('hidden');

    // Refresh leads when opening CRM
    fetchLeads(currentLeadsPage);
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Modal generic open/close
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('hidden');
  }
}

// ==========================================
// 1. LIVE FACEBOOK GROUP CRAWLER
// ==========================================
function setGroupUrl(url) {
  const input = document.getElementById('scraper-group-url');
  if (input) {
    input.value = url;
    showToast('Group URL loaded! Click "Start Scraping" below.');
    input.focus();
  }
}

async function pasteClipboardToGroupUrl() {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        const cleaned = sanitizeFacebookGroupUrl(text.trim());
        const input = document.getElementById('scraper-group-url');
        if (input) {
          input.value = cleaned;
          showToast('Pasted Facebook link from clipboard!');
          return;
        }
      }
    }
  } catch (_) {}
  const input = document.getElementById('scraper-group-url');
  if (input) {
    input.focus();
    input.select();
    showToast('Press Ctrl+V to paste your group link', 'info');
  }
}

function clearGroupUrl() {
  const input = document.getElementById('scraper-group-url');
  if (input) {
    input.value = '';
    input.focus();
  }
}

async function startFacebookGroupScrape() {
  const input = document.getElementById('scraper-group-url');
  const rawUrl = input?.value.trim();
  const maxPosts = document.getElementById('scraper-max-posts')?.value || '30';
  const browserMode = document.getElementById('scraper-browser-mode')?.value || 'headless';

  if (!rawUrl) {
    showToast('Please enter a Facebook Group URL first.', 'error');
    if (input) input.focus();
    return;
  }

  const cleanUrl = sanitizeFacebookGroupUrl(rawUrl);
  if (input && cleanUrl) {
    input.value = cleanUrl;
  }

  if (!cleanUrl.includes('facebook.com') || (!cleanUrl.includes('/groups/') && !cleanUrl.includes('/share/g/'))) {
    showToast('Please enter a valid Facebook Group link (e.g. https://web.facebook.com/share/g/...)', 'error');
    if (input) input.focus();
    return;
  }

  // Update UI to running state
  const btn = document.getElementById('btn-start-fb-scrape');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-70');
    btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 mr-2 animate-spin"></i><span>Scraping Facebook Group...</span>';
    if (window.lucide) window.lucide.createIcons();
  }

  appendConsoleLog(`Initiating scraper job for: ${cleanUrl}`);

  try {
    const res = await fetch('/api/scraper/start-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupUrl: cleanUrl,
        maxPosts: parseInt(maxPosts, 10),
        maxScrolls: Math.max(10, Math.ceil(parseInt(maxPosts, 10) / 2)),
        headless: browserMode === 'headless'
      })
    }).then(r => r.json());

    if (res.success) {
      showToast('🚀 Scraper running! Watching live feed in console below...');
      startScraperPolling();
    } else {
      showToast(res.error || 'Failed to start scraper', 'error');
      resetScraperButton();
    }
  } catch (err) {
    showToast(`Network error: ${err.message}`, 'error');
    resetScraperButton();
  }
}

async function stopActiveScrape() {
  try {
    const res = await fetch('/api/scraper/stop', { method: 'POST' }).then(r => r.json());
    if (res.success) {
      showToast('Scraper stopped.');
      appendConsoleLog('Scraper stopped by user request.');
      resetScraperButton();
      stopScraperPolling();
      updateTerminalBadge('Idle', 'bg-slate-800 text-slate-400');
    }
  } catch (err) {
    showToast(`Error stopping scraper: ${err.message}`, 'error');
  }
}

function resetScraperButton() {
  const btn = document.getElementById('btn-start-fb-scrape');
  if (btn) {
    btn.disabled = false;
    btn.classList.remove('opacity-70');
    btn.innerHTML = '<i data-lucide="play" class="w-4 h-4 mr-2"></i><span>Start Scraping Facebook Group & Extract Leads</span>';
    if (window.lucide) window.lucide.createIcons();
  }
}

async function checkExistingScraperJob() {
  try {
    const statusRes = await fetch('/api/scraper/status').then(r => r.json());
    if (statusRes.success && statusRes.data && statusRes.data.running) {
      const btn = document.getElementById('btn-start-fb-scrape');
      if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-70');
        btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 mr-2 animate-spin"></i><span>Scraping Facebook Group...</span>';
        if (window.lucide) window.lucide.createIcons();
      }
      startScraperPolling();
    }
  } catch (_) {}
}

function startScraperPolling() {
  if (scraperPollingInterval) clearInterval(scraperPollingInterval);
  pollScraperStatus();
  scraperPollingInterval = setInterval(pollScraperStatus, 1500);
}

function stopScraperPolling() {
  if (scraperPollingInterval) {
    clearInterval(scraperPollingInterval);
    scraperPollingInterval = null;
  }
}

async function pollScraperStatus() {
  try {
    const res = await fetch('/api/scraper/status').then(r => r.json());
    if (!res.success || !res.data) return;

    const data = res.data;

    // 1. Update terminal counter numbers
    const postsEl = document.getElementById('terminal-posts-count');
    const phonesEl = document.getElementById('terminal-phones-count');
    if (postsEl) postsEl.textContent = data.postsFound || 0;
    if (phonesEl) phonesEl.textContent = data.phonesFound || 0;

    // 2. Render logs into console
    if (Array.isArray(data.logs)) {
      renderConsoleLogs(data.logs);
    }

    // 3. Update status badge
    if (data.running) {
      updateTerminalBadge('Running', 'bg-blue-600 text-white animate-pulse');
    } else if (data.error) {
      updateTerminalBadge('Error', 'bg-red-600 text-white');
      resetScraperButton();
      stopScraperPolling();
    } else {
      updateTerminalBadge('Idle', 'bg-slate-800 text-slate-400');
      resetScraperButton();
      stopScraperPolling();

      // Scrape completed — refresh leads CRM badge and data
      fetchLeads(1);
    }
  } catch (_) {}
}

function updateTerminalBadge(text, classNames) {
  const badge = document.getElementById('terminal-status-badge');
  if (badge) {
    badge.textContent = text;
    badge.className = `px-2 py-0.5 rounded text-[10px] font-bold ${classNames}`;
  }
}

function renderConsoleLogs(logs) {
  const win = document.getElementById('terminal-logs-window');
  if (!win) return;

  if (logs.length === 0) {
    win.innerHTML = '<div class="text-slate-500">// Ready. Enter a Facebook Group URL above and click "Start Scraping".</div>';
    return;
  }

  win.innerHTML = logs.map(l => {
    let colorClass = 'text-emerald-400';
    if (l.includes('❌') || l.includes('Error')) colorClass = 'text-red-400';
    else if (l.includes('⚠️') || l.includes('Warning') || l.includes('Note')) colorClass = 'text-amber-300';
    else if (l.includes('🚀') || l.includes('Starting') || l.includes('Connected')) colorClass = 'text-cyan-300';
    else if (l.includes('🎉') || l.includes('Saved') || l.includes('Finished')) colorClass = 'text-emerald-300 font-bold';

    return `<div class="${colorClass}">${escapeHtml(l)}</div>`;
  }).join('');

  // Auto-scroll to latest log
  win.scrollTop = win.scrollHeight;
}

function appendConsoleLog(msg) {
  const win = document.getElementById('terminal-logs-window');
  if (!win) return;
  const time = new Date().toLocaleTimeString();
  const div = document.createElement('div');
  div.className = 'text-slate-300';
  div.textContent = `[${time}] ${msg}`;
  win.appendChild(div);
  win.scrollTop = win.scrollHeight;
}

// ==========================================
// 2. DIRECT INGEST (FAIL-SAFE TEXT/HTML)
// ==========================================
async function pasteClipboardToRawIngest() {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        const textarea = document.getElementById('raw-ingest-content');
        if (textarea) {
          textarea.value = text.trim();
          showToast('Pasted content from clipboard into Direct Ingest!');
          return;
        }
      }
    }
  } catch (_) {}
  const textarea = document.getElementById('raw-ingest-content');
  if (textarea) {
    textarea.focus();
    showToast('Press Ctrl+V to paste content', 'info');
  }
}

function clearRawIngest() {
  const textarea = document.getElementById('raw-ingest-content');
  if (textarea) textarea.value = '';
  const card = document.getElementById('raw-ingest-results-card');
  if (card) card.classList.add('hidden');
}

async function submitRawIngest() {
  const textarea = document.getElementById('raw-ingest-content');
  const rawContent = textarea?.value.trim();

  if (!rawContent) {
    showToast('Please paste group post text or HTML first.', 'error');
    if (textarea) textarea.focus();
    return;
  }

  const btn = document.getElementById('btn-submit-raw-ingest');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-70');
    btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 mr-1.5 animate-spin"></i><span>Extracting Contacts & Saving...</span>';
    if (window.lucide) window.lucide.createIcons();
  }

  try {
    const res = await fetch('/api/ingest/raw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawContent })
    }).then(r => r.json());

    if (!res.success) {
      showToast(`Extraction failed: ${res.error}`, 'error');
      return;
    }

    const { leadsCreated, leads } = res.data;

    // Render results card
    const card = document.getElementById('raw-ingest-results-card');
    const summaryText = document.getElementById('raw-ingest-summary-text');
    const listEl = document.getElementById('raw-ingest-results-list');

    if (card && summaryText && listEl) {
      card.classList.remove('hidden');
      summaryText.textContent = `Extracted ${leadsCreated} lead${leadsCreated === 1 ? '' : 's'} with verified contacts:`;

      if (leads && leads.length > 0) {
        listEl.innerHTML = leads.map(l => {
          const waUrl = l.formattedWhatsApp || (l.phoneNumber ? `https://wa.me/${l.phoneNumber.replace(/[^\d]/g, '')}` : null);
          return `
            <div class="p-2.5 bg-white rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
              <div class="space-y-0.5">
                <div class="font-bold text-slate-900 flex items-center space-x-1.5">
                  <span>${escapeHtml(l.agentName || 'Verified Agent')}</span>
                  ${l.propertyType ? `<span class="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded text-[10px]">${escapeHtml(l.propertyType)}</span>` : ''}
                </div>
                <div class="text-[11px] text-slate-500 flex items-center space-x-2">
                  <span class="font-mono text-slate-800 font-semibold">${escapeHtml(l.phoneNumber || 'No phone')}</span>
                  ${l.location ? `<span>&bull; ${escapeHtml(l.location)}</span>` : ''}
                  ${l.price ? `<span class="text-emerald-700 font-semibold">&bull; ${escapeHtml(l.price)}</span>` : ''}
                </div>
              </div>
              <div class="flex items-center space-x-1.5 shrink-0">
                ${waUrl ? `
                  <a href="${waUrl}" target="_blank" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[11px] font-semibold flex items-center">
                    <i data-lucide="message-circle" class="w-3 h-3 mr-1"></i>WhatsApp
                  </a>
                ` : ''}
                ${l.phoneNumber ? `
                  <a href="tel:${l.phoneNumber}" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-semibold flex items-center">
                    <i data-lucide="phone" class="w-3 h-3 mr-1"></i>Call
                  </a>
                ` : ''}
              </div>
            </div>
          `;
        }).join('');
        if (window.lucide) window.lucide.createIcons();
      } else {
        listEl.innerHTML = '<div class="text-slate-400 py-1">No phone numbers detected in the pasted text.</div>';
      }
    }

    showToast(`🎉 Extracted & saved ${leadsCreated} lead(s) to CRM database!`);

    // Refresh Leads CRM count and list
    fetchLeads(1);

  } catch (err) {
    showToast(`Error extracting contacts: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('opacity-70');
      btn.innerHTML = '<i data-lucide="sparkles" class="w-4 h-4 mr-1.5"></i><span>Extract Contacts & Save to CRM Database</span>';
      if (window.lucide) window.lucide.createIcons();
    }
  }
}

// ==========================================
// 3. LEADS CRM DASHBOARD
// ==========================================
function debounceLeadSearch() {
  if (leadSearchDebounceTimer) clearTimeout(leadSearchDebounceTimer);
  leadSearchDebounceTimer = setTimeout(() => {
    fetchLeads(1);
  }, 280);
}

async function fetchLeads(page = 1) {
  currentLeadsPage = page;

  const search = document.getElementById('lead-search-input')?.value.trim() || '';
  const status = document.getElementById('lead-filter-status')?.value || '';
  const hasPhone = document.getElementById('lead-filter-has-phone')?.checked || false;
  const hasWhatsApp = document.getElementById('lead-filter-has-wa')?.checked || false;
  const hasEmail = document.getElementById('lead-filter-has-email')?.checked || false;

  const params = new URLSearchParams({
    page,
    limit: 15,
    search,
    status,
    hasPhone: hasPhone ? 'true' : '',
    hasWhatsApp: hasWhatsApp ? 'true' : '',
    hasEmail: hasEmail ? 'true' : ''
  });

  try {
    const res = await fetch(`/api/leads?${params}`).then(r => r.json());
    if (!res.success) return;

    const { data: leads, pagination } = res;
    cachedLeads = leads;

    // Update header CRM badge
    const badge = document.getElementById('nav-leads-badge');
    if (badge) {
      badge.textContent = pagination.total || 0;
    }

    // Render mobile card view and desktop table view
    renderMobileLeadCards(leads);
    renderDesktopLeadTable(leads);
    renderPaginationControls(pagination);

    if (window.lucide) window.lucide.createIcons();

  } catch (err) {
    console.error('Failed to fetch leads:', err);
  }
}

/**
 * Mobile-First Dedicated Lead Cards (< 768px screens)
 * Features touch-friendly large buttons, no horizontal overflows, zero text breaks
 */
function renderMobileLeadCards(leads) {
  const container = document.getElementById('leads-cards-container');
  if (!container) return;

  if (leads.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-slate-400 space-y-2">
        <i data-lucide="inbox" class="w-8 h-8 mx-auto text-slate-300"></i>
        <p class="text-xs font-medium">No leads match your search or filter.</p>
        <p class="text-[11px] text-slate-400">Scrape a Facebook Group or paste posts in Direct Ingest to extract leads.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = leads.map(l => {
    const waUrl = l.formattedWhatsApp || (l.phoneNumber ? `https://wa.me/${l.phoneNumber.replace(/[^\d]/g, '')}` : null);
    const statusBg = l.status === 'Closed' ? 'bg-slate-100 text-slate-700 border-slate-300' :
                     l.status === 'Contacted' ? 'bg-blue-50 text-blue-800 border-blue-200' : 
                     'bg-emerald-50 text-emerald-800 border-emerald-200';

    return `
      <div class="p-4 space-y-3 bg-white hover:bg-slate-50/50 transition-colors">
        
        <!-- Header: Agent Name, Location Pill & Status Selector -->
        <div class="flex items-start justify-between gap-2">
          <div class="space-y-0.5">
            <h3 class="font-bold text-slate-900 text-sm flex items-center">
              <span class="w-2 h-2 rounded-full ${l.status === 'Closed' ? 'bg-slate-400' : (l.status === 'Contacted' ? 'bg-blue-500' : 'bg-emerald-500')} mr-2 shrink-0"></span>
              <span class="truncate">${escapeHtml(l.agentName || 'Verified Agent')}</span>
            </h3>
            ${l.location ? `
              <div class="text-[11px] text-slate-600 flex items-center font-medium">
                <i data-lucide="map-pin" class="w-3 h-3 mr-1 text-slate-400 shrink-0"></i>
                <span class="truncate">${escapeHtml(l.location)}</span>
              </div>
            ` : ''}
          </div>

          <!-- Status Dropdown -->
          <select 
            onchange="updateLeadStatus('${l.id}', this.value)" 
            class="text-[11px] font-semibold px-2 py-1 rounded-lg border ${statusBg} focus:outline-none cursor-pointer shrink-0"
          >
            <option value="New" ${l.status === 'New' ? 'selected' : ''}>New</option>
            <option value="Contacted" ${l.status === 'Contacted' ? 'selected' : ''}>Contacted</option>
            <option value="Closed" ${l.status === 'Closed' ? 'selected' : ''}>Closed</option>
          </select>
        </div>

        <!-- Property Badges Row -->
        <div class="flex flex-wrap items-center gap-1.5 text-[11px]">
          ${l.propertyType ? `
            <span class="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200 font-semibold">
              ${escapeHtml(l.propertyType)}
            </span>
          ` : ''}
          ${l.price ? `
            <span class="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
              ${escapeHtml(l.price)}
            </span>
          ` : ''}
          ${l.email ? `
            <span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] truncate max-w-[180px]">
              ${escapeHtml(l.email)}
            </span>
          ` : ''}
        </div>

        <!-- Post Snippet -->
        ${l.postSnippet ? `
          <p class="text-xs text-slate-600 line-clamp-2 italic bg-slate-50 p-2 rounded-lg border border-slate-100">
            "${escapeHtml(l.postSnippet)}"
          </p>
        ` : ''}

        <!-- 1-Click Touch Action Buttons (WhatsApp & Phone Call) -->
        <div class="grid grid-cols-2 gap-2 pt-1">
          ${waUrl ? `
            <a 
              href="${waUrl}" 
              target="_blank" 
              class="flex items-center justify-center py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
            >
              <i data-lucide="message-circle" class="w-4 h-4 mr-1.5"></i>
              <span>WhatsApp</span>
            </a>
          ` : `
            <div class="flex items-center justify-center py-2.5 px-3 bg-slate-100 text-slate-400 rounded-xl text-xs font-medium cursor-not-allowed">
              <span>No WhatsApp</span>
            </div>
          `}

          ${l.phoneNumber ? `
            <a 
              href="tel:${l.phoneNumber}" 
              class="flex items-center justify-center py-2.5 px-3 bg-slate-800 hover:bg-slate-900 active:scale-98 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
            >
              <i data-lucide="phone" class="w-3.5 h-3.5 mr-1.5"></i>
              <span>Call (${escapeHtml(l.phoneNumber.slice(-4))})</span>
            </a>
          ` : `
            <div class="flex items-center justify-center py-2.5 px-3 bg-slate-100 text-slate-400 rounded-xl text-xs font-medium cursor-not-allowed">
              <span>No Phone</span>
            </div>
          `}
        </div>

        <!-- Footer Actions (Edit & Delete) -->
        <div class="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px] text-slate-400">
          <span>${formatDate(l.scrapedAt)}</span>
          <div class="flex items-center space-x-2">
            <button onclick='openEditLeadModal(${JSON.stringify(l).replace(/'/g, "&apos;")})' class="text-slate-600 hover:text-slate-900 font-medium">Edit</button>
            <span>&bull;</span>
            <button onclick="deleteLeadAction('${l.id}')" class="text-red-600 hover:text-red-700 font-medium">Delete</button>
          </div>
        </div>

      </div>
    `;
  }).join('');
}

/**
 * Desktop Lead Table (>= 768px screens)
 */
function renderDesktopLeadTable(leads) {
  const tbody = document.getElementById('leads-table-body');
  if (!tbody) return;

  if (leads.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="px-4 py-10 text-center text-slate-400">
          No leads match your search criteria. Scrape a Facebook group or paste listings in Direct Ingest above!
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = leads.map(l => {
    const waUrl = l.formattedWhatsApp || (l.phoneNumber ? `https://wa.me/${l.phoneNumber.replace(/[^\d]/g, '')}` : null);
    const statusBg = l.status === 'Closed' ? 'border-slate-300 text-slate-600 bg-slate-50' : 
                     l.status === 'Contacted' ? 'border-blue-300 text-blue-800 bg-blue-50' : 
                     'border-emerald-300 text-emerald-800 bg-emerald-50';

    return `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <!-- 1. Agent Name -->
        <td class="px-4 py-3">
          <div class="font-bold text-slate-900 flex items-center">
            <span class="w-2 h-2 rounded-full ${l.status === 'Closed' ? 'bg-slate-400' : (l.status === 'Contacted' ? 'bg-blue-500' : 'bg-emerald-500')} mr-2 shrink-0"></span>
            <span>${escapeHtml(l.agentName || 'Verified Agent')}</span>
          </div>
          ${l.email ? `
            <div class="text-[11px] text-slate-400 pl-4 truncate max-w-[160px]">${escapeHtml(l.email)}</div>
          ` : ''}
        </td>

        <!-- 2. Phone Number -->
        <td class="px-4 py-3 font-mono text-xs">
          ${l.phoneNumber ? `
            <div class="flex items-center space-x-1.5">
              <span class="text-slate-800 font-bold">${escapeHtml(l.phoneNumber)}</span>
              <a href="tel:${l.phoneNumber}" class="text-slate-400 hover:text-blue-600 transition-colors" title="Call">
                <i data-lucide="phone" class="w-3.5 h-3.5"></i>
              </a>
            </div>
          ` : '<span class="text-slate-400 italic">None</span>'}
        </td>

        <!-- 3. Property & Price -->
        <td class="px-4 py-3 text-xs">
          <div class="font-medium text-slate-800">${escapeHtml(l.propertyType || 'Real Estate Listing')}</div>
          ${l.price ? `<div class="text-emerald-700 font-bold text-[11px]">${escapeHtml(l.price)}</div>` : ''}
        </td>

        <!-- 4. Location -->
        <td class="px-4 py-3 text-xs text-slate-700">
          ${l.location ? `
            <span class="inline-flex items-center font-medium">
              <i data-lucide="map-pin" class="w-3 h-3 mr-1 text-slate-400"></i>${escapeHtml(l.location)}
            </span>
          ` : '<span class="text-slate-400 italic">Not specified</span>'}
        </td>

        <!-- 5. WhatsApp Action -->
        <td class="px-4 py-3">
          ${waUrl ? `
            <a 
              href="${waUrl}" 
              target="_blank" 
              class="inline-flex items-center px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 font-semibold text-xs shadow-xs transition-all"
            >
              <i data-lucide="message-circle" class="w-3.5 h-3.5 mr-1 text-emerald-600"></i>Chat on WhatsApp
            </a>
          ` : '<span class="text-slate-400 text-xs italic">No WhatsApp</span>'}
        </td>

        <!-- 6. Status Selector -->
        <td class="px-4 py-3">
          <select 
            onchange="updateLeadStatus('${l.id}', this.value)" 
            class="text-xs font-semibold px-2 py-1 rounded-lg border ${statusBg} focus:outline-none cursor-pointer"
          >
            <option value="New" ${l.status === 'New' ? 'selected' : ''}>New</option>
            <option value="Contacted" ${l.status === 'Contacted' ? 'selected' : ''}>Contacted</option>
            <option value="Closed" ${l.status === 'Closed' ? 'selected' : ''}>Closed</option>
          </select>
        </td>

        <!-- 7. Actions -->
        <td class="px-4 py-3 text-right space-x-1 whitespace-nowrap">
          <button 
            onclick='openEditLeadModal(${JSON.stringify(l).replace(/'/g, "&apos;")})' 
            class="p-1 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer" 
            title="Edit Lead"
          >
            <i data-lucide="edit-2" class="w-4 h-4"></i>
          </button>
          <button 
            onclick="deleteLeadAction('${l.id}')" 
            class="p-1 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors cursor-pointer" 
            title="Delete Lead"
          >
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderPaginationControls(pagination) {
  const infoEl = document.getElementById('lead-pagination-info');
  const controlsEl = document.getElementById('lead-pagination-controls');

  if (infoEl) {
    const from = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
    const to = Math.min(pagination.page * pagination.limit, pagination.total);
    infoEl.textContent = `Showing ${from}–${to} of ${pagination.total} leads`;
  }

  if (controlsEl) {
    if (pagination.pages <= 1) {
      controlsEl.innerHTML = '';
      return;
    }

    let buttons = '';
    if (pagination.page > 1) {
      buttons += `<button onclick="fetchLeads(${pagination.page - 1})" class="px-2.5 py-1 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 text-xs font-semibold">&larr; Prev</button>`;
    }
    buttons += `<span class="px-2 text-xs font-bold text-slate-700">Page ${pagination.page} of ${pagination.pages}</span>`;
    if (pagination.page < pagination.pages) {
      buttons += `<button onclick="fetchLeads(${pagination.page + 1})" class="px-2.5 py-1 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 text-xs font-semibold">Next &rarr;</button>`;
    }
    controlsEl.innerHTML = buttons;
  }
}

async function updateLeadStatus(leadId, newStatus) {
  try {
    const res = await fetch(`/api/leads/${leadId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    }).then(r => r.json());

    if (res.success) {
      showToast(`Status updated to "${newStatus}"`);
    } else {
      showToast(res.error || 'Failed to update status', 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function deleteLeadAction(leadId) {
  if (!confirm('Are you sure you want to delete this lead?')) return;

  try {
    const res = await fetch(`/api/leads/${leadId}`, { method: 'DELETE' }).then(r => r.json());
    if (res.success) {
      showToast('Lead deleted.');
      fetchLeads(currentLeadsPage);
    } else {
      showToast(res.error || 'Failed to delete lead', 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

// Modal: Add / Edit Lead
function openAddLeadModal() {
  document.getElementById('lead-modal-title').textContent = 'Add New Lead';
  document.getElementById('lead-modal-id').value = '';
  document.getElementById('lead-modal-name').value = '';
  document.getElementById('lead-modal-phone').value = '';
  document.getElementById('lead-modal-whatsapp').value = '';
  document.getElementById('lead-modal-property-type').value = '';
  document.getElementById('lead-modal-location').value = '';
  document.getElementById('lead-modal-price').value = '';
  document.getElementById('lead-modal-status').value = 'New';
  document.getElementById('lead-modal-snippet').value = '';
  openModal('leadModal');
}

function openEditLeadModal(lead) {
  document.getElementById('lead-modal-title').textContent = 'Edit Lead';
  document.getElementById('lead-modal-id').value = lead.id || '';
  document.getElementById('lead-modal-name').value = lead.agentName || '';
  document.getElementById('lead-modal-phone').value = lead.phoneNumber || '';
  document.getElementById('lead-modal-whatsapp').value = lead.formattedWhatsApp || '';
  document.getElementById('lead-modal-property-type').value = lead.propertyType || '';
  document.getElementById('lead-modal-location').value = lead.location || '';
  document.getElementById('lead-modal-price').value = lead.price || '';
  document.getElementById('lead-modal-status').value = lead.status || 'New';
  document.getElementById('lead-modal-snippet').value = lead.postSnippet || '';
  openModal('leadModal');
}

async function submitLeadModalForm() {
  const id = document.getElementById('lead-modal-id').value;
  const agentName = document.getElementById('lead-modal-name').value.trim();
  const phoneNumber = document.getElementById('lead-modal-phone').value.trim();
  const formattedWhatsApp = document.getElementById('lead-modal-whatsapp').value.trim();
  const propertyType = document.getElementById('lead-modal-property-type').value.trim();
  const location = document.getElementById('lead-modal-location').value.trim();
  const price = document.getElementById('lead-modal-price').value.trim();
  const status = document.getElementById('lead-modal-status').value;
  const postSnippet = document.getElementById('lead-modal-snippet').value.trim();

  if (!agentName) {
    showToast('Agent Name is required', 'error');
    document.getElementById('lead-modal-name').focus();
    return;
  }

  const payload = {
    agentName,
    phoneNumber,
    formattedWhatsApp,
    propertyType,
    location,
    price,
    status,
    postSnippet
  };

  try {
    const isEdit = Boolean(id);
    const url = isEdit ? `/api/leads/${id}` : '/api/leads';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(r => r.json());

    if (res.success) {
      showToast(isEdit ? 'Lead updated successfully!' : 'Lead created successfully!');
      closeModal('leadModal');
      fetchLeads(currentLeadsPage);
    } else {
      showToast(res.error || 'Failed to save lead', 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

// Export Leads to CSV (real downloadable .csv file)
function exportLeadsCsv() {
  showToast('Generating CSV export file...', 'info');
  window.location.href = '/api/leads/export/csv';
}

// Reset entire database
async function confirmResetDatabase() {
  if (!confirm('⚠️ Are you sure you want to delete ALL discovered leads and start completely fresh? This will wipe the database to 0 records.')) {
    return;
  }

  try {
    const res = await fetch('/api/database/reset', { method: 'POST' }).then(r => r.json());
    if (res.success) {
      showToast('🗑️ Database wiped clean! All leads deleted.');
      fetchLeads(1);
      const postsCount = document.getElementById('terminal-posts-count');
      const phonesCount = document.getElementById('terminal-phones-count');
      if (postsCount) postsCount.textContent = '0';
      if (phonesCount) phonesCount.textContent = '0';
      const logWin = document.getElementById('terminal-logs-window');
      if (logWin) logWin.innerHTML = '<div class="text-slate-500">// Database wiped clean. Ready for new scrape.</div>';
    } else {
      showToast(res.error || 'Failed to reset database', 'error');
    }
  } catch (err) {
    showToast(`Error resetting database: ${err.message}`, 'error');
  }
}

// ==========================================
// 4. FACEBOOK SESSION & COOKIES MANAGEMENT
// ==========================================
async function checkFacebookSessionStatus() {
  try {
    const res = await fetch('/api/scraper/status').then(r => r.json());
    const pill = document.getElementById('fb-session-pill');
    const text = document.getElementById('fb-session-text');
    if (!pill || !text) return;

    if (res.data && res.data.profile && res.data.profile.hasUserSession) {
      pill.className = 'px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center';
      text.textContent = 'Session Connected (Live Feed)';
    } else {
      pill.className = 'px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center';
      text.textContent = 'Guest Mode (1 post)';
    }
  } catch (_) {}
}

async function saveFacebookCookiesAction() {
  const input = document.getElementById('modal-fb-cookies-input');
  const cookieText = input?.value.trim();

  if (!cookieText) {
    showToast('Please paste your Facebook cookies (c_user & xs).', 'error');
    if (input) input.focus();
    return;
  }

  try {
    const res = await fetch('/api/scraper/session/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookies: cookieText })
    }).then(r => r.json());

    if (res.success) {
      showToast('✅ Facebook session cookies saved successfully!');
      closeModal('facebookSessionModal');
      checkFacebookSessionStatus();
    } else {
      showToast(res.error || 'Failed to save session cookies', 'error');
    }
  } catch (err) {
    showToast(`Error saving cookies: ${err.message}`, 'error');
  }
}

async function clearFacebookCookiesAction() {
  try {
    const res = await fetch('/api/scraper/session/clear', { method: 'POST' }).then(r => r.json());
    if (res.success) {
      showToast('Facebook session removed. Switched to public guest mode.');
      closeModal('facebookSessionModal');
      checkFacebookSessionStatus();
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}
