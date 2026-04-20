/* globals skeletonApp */
// ===== CONSTANTS =====
const HORIZON_LABELS = ['Dage', 'Uger', 'Måneder', 'År'];
const HORIZON_VALUES = ['dage', 'uger', 'måneder', 'år'];
const HORIZON_ORDER  = { dage: 0, uger: 1, måneder: 2, år: 3 };

const KANBAN_COLS = [
  { id: 'ide',       label: 'Idé',       dotClass: 'dot-ide' },
  { id: 'planlagt',  label: 'Planlagt',  dotClass: 'dot-planlagt' },
  { id: 'igang',     label: 'Igang',     dotClass: 'dot-igang' },
  { id: 'afsluttet', label: 'Afsluttet', dotClass: 'dot-afsluttet' },
];

// Config injected via wp_localize_script (skeletonApp.restUrl, skeletonApp.nonce)
const REST_URL     = (typeof skeletonApp !== 'undefined') ? skeletonApp.restUrl     : '';
const WP_NONCE     = (typeof skeletonApp !== 'undefined') ? skeletonApp.nonce       : '';
const CURRENT_USER = (typeof skeletonApp !== 'undefined') ? skeletonApp.currentUser : { name: 'Bruger', email: '' };

// ===== TIMER STATE =====
var timerInterval = null;
var timerSeconds  = 0;
var timerRunning  = false;

function timerPad(n) { return n < 10 ? '0' + String(n) : String(n); }
function timerFormat(s) {
  var h = Math.floor(s / 3600);
  var m = Math.floor((s % 3600) / 60);
  var sec = s % 60;
  return (h > 0 ? timerPad(h) + ':' : '') + timerPad(m) + ':' + timerPad(sec);
}
function startTimer() {
  if (timerRunning) return;
  timerRunning = true;
  timerInterval = setInterval(function() {
    timerSeconds++;
    var el = document.getElementById('timer-display');
    if (el) el.textContent = timerFormat(timerSeconds);
    var lbl = document.getElementById('timer-status-label');
    if (lbl) lbl.textContent = 'Tidsregistrering kører…';
  }, 1000);
}
function stopTimer() {
  clearInterval(timerInterval);
  timerRunning = false;
  var lbl = document.getElementById('timer-status-label');
  if (lbl) lbl.textContent = timerSeconds > 0 ? timerFormat(timerSeconds) + ' registreret' : 'Klar til start';
}

// ===== STATE =====
let workspaces       = [];

// Track whether a modal is open – polling will not re-render while a modal is open.
let modalOpen = false;

// Polling interval handle.
let pollHandle = null;

let appState = {
  page:        'dashboard',  // 'dashboard' | 'workspaces' | 'workspace'
  workspaceId: null,
  detailView:  'kanban',     // 'list' | 'kanban' | 'timeline'
};

let currentFilters = {
  audience: 'all', status: 'all', horizon: 'all',
  impl: 'all', effect: 'all', deadline: 'all',
};
let currentSort       = 'default';
let newInitiativeWsId = null;

// ===== HELPERS =====
function implClass(v)    { return v === 'lav' ? 'impl-low' : v === 'middel' ? 'impl-mid' : 'impl-high'; }
function implDotClass(v) { return v === 'lav' ? 'green' : v === 'middel' ? 'yellow' : 'red'; }
function implLabel(v)    { return v === 'lav' ? 'Lav' : v === 'middel' ? 'Middel' : 'Høj'; }
function horizonLabel(v) { if (!v) return 'Uger'; return v.charAt(0).toUpperCase() + v.slice(1); }
function statusLabel(s) {
  return { ide: 'Idé', planlagt: 'Planlagt', igang: 'Igang', afsluttet: 'Afsluttet' }[s] || s;
}

function getWorkspace(id) { return workspaces.find(ws => ws.id === id); }

function getAllInitiatives() {
  return workspaces.flatMap(ws =>
    ws.initiatives.map(i => Object.assign({}, i, { workspaceName: ws.name, workspaceIcon: ws.icon }))
  );
}

// Simple HTML escape helper
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ===== REST API HELPERS =====
function apiFetch(path, options) {
  var url = REST_URL + path;
  var opts = Object.assign({ headers: {} }, options || {});
  if (WP_NONCE) {
    opts.headers['X-WP-Nonce'] = WP_NONCE;
  }
  if (opts.body && typeof opts.body === 'object') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  return fetch(url, opts).then(function(res) {
    if (!res.ok) {
      return res.json().catch(function() { return {}; }).then(function(err) {
        throw new Error((err && err.message) ? err.message : 'HTTP ' + res.status);
      });
    }
    var ct = res.headers.get('Content-Type') || '';
    if (ct.indexOf('application/json') >= 0) return res.json();
    return res.text();
  });
}

// ===== SERVER HYDRATION =====
function loadWorkspacesFromServer() {
  return apiFetch('workspaces').then(function(data) {
    workspaces = Array.isArray(data) ? data : [];
  }).catch(function(err) {
    console.error('Skeleton: kunne ikke hente arbejdsområder', err);
  });
}

// ===== POLLING (every 30 s) =====
function startPolling() {
  if (pollHandle) return;
  pollHandle = setInterval(function() {
    if (modalOpen) return; // do not disrupt open forms
    apiFetch('workspaces').then(function(data) {
      if (!Array.isArray(data)) return;
      // Simple change detection via JSON comparison
      if (JSON.stringify(data) === JSON.stringify(workspaces)) return;
      workspaces = data;
      renderSidebar();
      renderMain();
    }).catch(function() { /* silently ignore polling errors */ });
  }, 30000);
}

// ===== NAVIGATION =====
function navigate(page, workspaceId) {
  appState.page        = page;
  appState.workspaceId = workspaceId !== undefined ? workspaceId : null;
  if (page !== 'workspace') {
    currentFilters = { audience: 'all', status: 'all', horizon: 'all', impl: 'all', effect: 'all', deadline: 'all' };
    currentSort    = 'default';
  }
  renderSidebar();
  renderMain();
}

// ===== SIDEBAR =====
function renderSidebar() {
  document.getElementById('nav-dashboard').classList.toggle('active', appState.page === 'dashboard');
  document.getElementById('nav-workspaces').classList.toggle('active', appState.page === 'workspaces');

  var list = document.getElementById('sidebar-ws-list');
  list.innerHTML = '';
  workspaces.forEach(function(ws) {
    var el = document.createElement('div');
    el.className = 'sidebar-ws-item' + (appState.workspaceId === ws.id ? ' active' : '');
    el.innerHTML =
      '<span class="sidebar-ws-icon">' + ws.icon + '</span>' +
      '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(ws.name) + '</span>' +
      '<span class="sidebar-ws-count">' + ws.initiatives.length + '</span>';
    el.onclick = (function(id) { return function() { navigate('workspace', id); }; })(ws.id);
    list.appendChild(el);
  });
}

// ===== MAIN RENDER DISPATCHER =====
function renderMain() {
  var mc = document.getElementById('main-content');
  if (appState.page === 'dashboard')  renderDashboard(mc);
  else if (appState.page === 'workspaces') renderWorkspacesOverview(mc);
  else if (appState.page === 'workspace')  renderWorkspaceDetail(mc, appState.workspaceId);
}

// ===== A) DASHBOARD =====
function renderDashboard(container) {
  var all         = getAllInitiatives();
  var activeCount = all.filter(function(i){ return i.status !== 'afsluttet'; }).length;
  var inProgress  = all.filter(function(i){ return i.status === 'igang'; }).length;
  var totalCost   = all.reduce(function(s,i){ return s + (i.cost||0); }, 0);
  var avgROI      = all.length > 0
    ? (all.reduce(function(s,i){ return s + (i.roi||0); }, 0) / all.length).toFixed(1)
    : '—';

  var now  = new Date();
  var soon = all
    .filter(function(i){ return i.deadline && i.status !== 'afsluttet'; })
    .map(function(i){ return Object.assign({}, i, { daysLeft: Math.ceil((new Date(i.deadline) - now) / 86400000) }); })
    .filter(function(i){ return i.daysLeft <= 30; })
    .sort(function(a,b){ return a.daysLeft - b.daysLeft; });

  // Format Danish date
  var dkMonths = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'];
  function fmtDkDate(iso) {
    if (!iso) return '';
    var parts = iso.split('-');
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d.getDate() + '. ' + dkMonths[d.getMonth()] + ' ' + d.getFullYear();
  }

  // Deadline list (clean format)
  var deadlineHtml = soon.length === 0
    ? '<div style="padding:1rem 0;color:var(--text-muted);font-size:13px;">Ingen kommende deadlines inden for 30 dage.</div>'
    : soon.slice(0,5).map(function(i){
        var left = i.daysLeft <= 0 ? 'Overskredet' : i.daysLeft + ' dage tilbage';
        return '<div class="dash-deadline-item">' +
          '<div class="dl-task-icon">&#x1F4CB;</div>' +
          '<div class="dl-info">' +
            '<div class="dl-title">' + escHtml(i.title) + '</div>' +
            '<div class="dl-ws">' + i.workspaceIcon + ' ' + escHtml(i.workspaceName) + ' &middot; ' + left + '</div>' +
          '</div>' +
          '<div class="dl-date">' + fmtDkDate(i.deadline) + '</div>' +
          '</div>';
      }).join('');

  // Workspace cards
  var wsHtml;
  if (workspaces.length === 0) {
    wsHtml = '<div class="empty-state">Ingen arbejdsområder endnu.<br>' +
      '<button class="btn-primary" style="margin-top:1rem;" onclick="openNewWorkspaceModal()">+ Nyt arbejdsområde</button></div>';
  } else {
    wsHtml = '<div class="ws-grid dash-ws-grid">' +
      workspaces.map(function(ws){
        var active = ws.initiatives.filter(function(i){ return i.status !== 'afsluttet'; }).length;
        return '<div class="ws-card" onclick="navigate(\'workspace\',' + ws.id + ')">' +
          '<div class="ws-card-icon">' + ws.icon + '</div>' +
          '<div class="ws-card-name">' + escHtml(ws.name) + '</div>' +
          '<div class="ws-card-desc">' + escHtml(ws.description) + '</div>' +
          '<div class="ws-card-meta"><strong>' + ws.initiatives.length + '</strong> initiativer &middot; ' + active + ' aktive</div>' +
          '</div>';
      }).join('') +
      '</div>';
  }

  // Bar chart weekly data (static illustrative)
  var barData = [
    { day: 'Man', val: 4,  pct: 57  },
    { day: 'Tir', val: 7,  pct: 100 },
    { day: 'Ons', val: 5,  pct: 71  },
    { day: 'Tor', val: 6,  pct: 86, active: true },
    { day: 'Fre', val: 3,  pct: 43  },
    { day: 'Lør', val: 1,  pct: 14  },
    { day: 'Søn', val: 2,  pct: 28  },
  ];
  var barsHtml = barData.map(function(b){
    return '<div class="bar-item">' +
      '<div class="bar-val">' + b.val + '</div>' +
      '<div class="bar-fill' + (b.active ? ' bar-active' : '') + '" style="height:' + b.pct + '%;"></div>' +
      '<div class="bar-label">' + b.day + '</div>' +
      '</div>';
  }).join('');

  // Progress ring (41%)
  var ringPct  = 41;
  var ringR    = 46;
  var ringCirc = 2 * Math.PI * ringR; // ≈ 289
  var ringOff  = ringCirc * (1 - ringPct / 100);
  var ringHtml =
    '<div class="progress-ring-wrap">' +
      '<svg width="120" height="120" viewBox="0 0 120 120">' +
        '<circle cx="60" cy="60" r="' + ringR + '" fill="none" stroke="var(--border)" stroke-width="12"/>' +
        '<circle cx="60" cy="60" r="' + ringR + '" fill="none" stroke="var(--accent)" stroke-width="12"' +
          ' stroke-dasharray="' + ringCirc.toFixed(1) + '"' +
          ' stroke-dashoffset="' + ringOff.toFixed(1) + '"' +
          ' stroke-linecap="round" transform="rotate(-90 60 60)"/>' +
        '<text x="60" y="55" text-anchor="middle" font-size="20" font-weight="700" fill="var(--text)" font-family="Barlow Condensed, sans-serif">' + ringPct + '%</text>' +
        '<text x="60" y="72" text-anchor="middle" font-size="10" fill="var(--text-muted)" font-family="Barlow, sans-serif">Afsluttet</text>' +
      '</svg>' +
      '<div class="progress-ring-sub">Samlet projektfremgang<br>baseret på afsluttede initiativer</div>' +
    '</div>';

  // Team collaboration widget (static illustrative)
  var teamMembers = [
    { initials: 'AB', color: '#166534', name: 'Anders Bjerg',      role: 'Projektleder',  statusClass: 'ts-done',    statusLabel: 'Afsluttet' },
    { initials: 'MC', color: '#1d4ed8', name: 'Maria Christensen', role: 'Analytiker',    statusClass: 'ts-ongoing', statusLabel: 'I gang' },
    { initials: 'JP', color: '#9333ea', name: 'Jonas Poulsen',     role: 'Udvikler',      statusClass: 'ts-ongoing', statusLabel: 'I gang' },
    { initials: 'SN', color: '#b45309', name: 'Sara Nielsen',      role: 'Designer',      statusClass: 'ts-waiting', statusLabel: 'Afventer' },
  ];
  var teamHtml = '<div class="team-list">' +
    teamMembers.map(function(m){
      return '<div class="team-member">' +
        '<div class="team-avatar" style="background:' + m.color + ';">' + m.initials + '</div>' +
        '<div class="team-info">' +
          '<div class="team-name">' + escHtml(m.name) + '</div>' +
          '<div class="team-role">' + escHtml(m.role) + '</div>' +
        '</div>' +
        '<span class="team-status ' + m.statusClass + '">' + m.statusLabel + '</span>' +
        '</div>';
    }).join('') +
    '</div>';

  // Timer widget
  var timerHtml =
    '<div id="timer-display" class="timer-display">' + timerFormat(timerSeconds) + '</div>' +
    '<div id="timer-status-label" class="timer-label">' + (timerRunning ? 'Tidsregistrering kører…' : (timerSeconds > 0 ? timerFormat(timerSeconds) + ' registreret' : 'Klar til start')) + '</div>' +
    '<div class="timer-controls">' +
      '<button class="timer-btn timer-play" onclick="startTimer()">&#x25B6; Afspil</button>' +
      '<button class="timer-btn timer-stop" onclick="stopTimer()">&#x25A0; Stop</button>' +
    '</div>';

  // Current user initials for header avatar
  var userInitials = CURRENT_USER.name
    ? CURRENT_USER.name.split(' ').map(function(p){ return p[0]; }).join('').toUpperCase().slice(0,2)
    : 'BU';

  container.innerHTML =
    '<div class="topbar">' +
      '<div>' +
        '<div class="topbar-title">&#x1F4CA; Dashboard</div>' +
        '<div class="topbar-sub">Overblik over alle arbejdsområder og initiativer</div>' +
      '</div>' +
    '</div>' +
    '<div class="page-body">' +

      // Stat cards row
      '<div class="dash-stat-grid">' +
        '<div class="dash-stat-card">' +
          '<div class="dsc-header"><span class="dsc-icon">&#x1F4C1;</span><span class="dsc-trend trend-up">&#x2191; +2</span></div>' +
          '<div class="dsc-value">' + workspaces.length + '</div>' +
          '<div class="dsc-label">Arbejdsområder</div>' +
        '</div>' +
        '<div class="dash-stat-card">' +
          '<div class="dsc-header"><span class="dsc-icon">&#x1F680;</span><span class="dsc-trend trend-up">&#x2191; +3</span></div>' +
          '<div class="dsc-value">' + activeCount + '</div>' +
          '<div class="dsc-label">Aktive initiativer</div>' +
        '</div>' +
        '<div class="dash-stat-card">' +
          '<div class="dsc-header"><span class="dsc-icon">&#x26A1;</span><span class="dsc-trend trend-flat">&#x2192; 0</span></div>' +
          '<div class="dsc-value">' + inProgress + '</div>' +
          '<div class="dsc-label">Igangværende</div>' +
        '</div>' +
        '<div class="dash-stat-card">' +
          '<div class="dsc-header"><span class="dsc-icon">&#x1F4C8;</span><span class="dsc-trend trend-up">&#x2191; 0.3</span></div>' +
          '<div class="dsc-value">' + avgROI + '</div>' +
          '<div class="dsc-label">Gns. ROI</div>' +
        '</div>' +
        '<div class="dash-stat-card">' +
          '<div class="dsc-header"><span class="dsc-icon">&#x1F4B0;</span><span class="dsc-trend trend-down">&#x2193;</span></div>' +
          '<div class="dsc-value" style="font-size:26px;">' + (totalCost > 0 ? totalCost.toLocaleString('da-DK') : '0') + '</div>' +
          '<div class="dsc-label">Estimeret pris (DKK)</div>' +
        '</div>' +
      '</div>' +

      // Row 1 widgets: Projektanalytik + Projektfremgang
      '<div class="dash-widget-grid-2">' +
        '<div class="dash-widget">' +
          '<div class="dash-widget-title"><span class="dash-widget-title-icon">&#x1F4CA;</span>Projektanalytik</div>' +
          '<div style="font-size:11px;color:var(--text-muted);margin-bottom:0.75rem;">Initiativer oprettet denne uge</div>' +
          '<div class="bar-chart">' + barsHtml + '</div>' +
        '</div>' +
        '<div class="dash-widget">' +
          '<div class="dash-widget-title"><span class="dash-widget-title-icon">&#x1F3AF;</span>Projektfremgang</div>' +
          ringHtml +
        '</div>' +
      '</div>' +

      // Row 2 widgets: Kommende Deadlines + Hold-samarbejde + Tidsregistrering
      '<div class="dash-widget-grid">' +
        '<div class="dash-widget">' +
          '<div class="dash-widget-title"><span class="dash-widget-title-icon">&#x23F0;</span>Kommende Deadlines</div>' +
          '<div class="dash-deadline-list">' + deadlineHtml + '</div>' +
        '</div>' +
        '<div class="dash-widget">' +
          '<div class="dash-widget-title"><span class="dash-widget-title-icon">&#x1F465;</span>Hold-samarbejde</div>' +
          teamHtml +
        '</div>' +
        '<div class="dash-widget">' +
          '<div class="dash-widget-title"><span class="dash-widget-title-icon">&#x23F1;&#xFE0F;</span>Tidsregistrering</div>' +
          timerHtml +
        '</div>' +
      '</div>' +

      // Workspace overview
      '<div class="dash-section-title">&#x1F4C1; Alle arbejdsområder</div>' +
      wsHtml +

    '</div>';
}

// ===== B) WORKSPACES OVERVIEW =====
function renderWorkspacesOverview(container) {
  var cardsHtml = workspaces.map(function(ws){
    var active = ws.initiatives.filter(function(i){ return i.status !== 'afsluttet'; }).length;
    return '<div class="ws-card" onclick="navigate(\'workspace\',' + ws.id + ')">' +
      '<div class="ws-card-icon">' + ws.icon + '</div>' +
      '<div class="ws-card-name">' + escHtml(ws.name) + '</div>' +
      '<div class="ws-card-desc">' + escHtml(ws.description) + '</div>' +
      '<div class="ws-card-meta"><strong>' + ws.initiatives.length + '</strong> initiativer &middot; ' + active + ' aktive</div>' +
      '</div>';
  }).join('');

  container.innerHTML =
    '<div class="topbar">' +
      '<div>' +
        '<div class="topbar-title">&#x1F4C1; Arbejdsområder</div>' +
        '<div class="topbar-sub">' + workspaces.length + ' arbejdsområde' + (workspaces.length !== 1 ? 'r' : '') + '</div>' +
      '</div>' +
      '<div class="topbar-actions"><button class="btn-primary" onclick="openNewWorkspaceModal()">+ Nyt arbejdsområde</button></div>' +
    '</div>' +
    '<div class="page-body">' +
      '<div class="ws-grid">' +
        cardsHtml +
        '<div class="ws-card ws-add-card" onclick="openNewWorkspaceModal()">' +
          '<div class="ws-add-plus">+</div>' +
          '<div class="ws-add-label">Nyt arbejdsområde</div>' +
        '</div>' +
      '</div>' +
    '</div>';
}

// ===== C) WORKSPACE DETAIL =====
function renderWorkspaceDetail(container, wsId) {
  var ws = getWorkspace(wsId);
  if (!ws) { navigate('workspaces'); return; }

  var filtered = getFilteredInitiatives(ws.initiatives);
  var sorted   = getSortedInitiatives(filtered);

  var view = appState.detailView;

  container.innerHTML =
    '<div class="topbar">' +
      '<div style="display:flex;align-items:center;gap:12px;">' +
        '<span class="ws-detail-icon-big">' + ws.icon + '</span>' +
        '<div>' +
          '<div class="ws-detail-name">' + escHtml(ws.name) + '</div>' +
          '<div class="ws-detail-desc">' + escHtml(ws.description) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="topbar-actions">' +
        '<button class="btn-primary" onclick="openNewInitiativeModal(' + wsId + ')">+ Nyt initiativ</button>' +
      '</div>' +
    '</div>' +

    '<div class="detail-toolbar">' +
      '<div class="view-switcher">' +
        '<button class="vs-btn' + (view==='list'    ?' active':'') + '" onclick="switchDetailView(\'list\')">&#x2630; Liste</button>' +
        '<button class="vs-btn' + (view==='kanban'  ?' active':'') + '" onclick="switchDetailView(\'kanban\')">&#x1F4CC; Kanban</button>' +
        '<button class="vs-btn' + (view==='timeline'?' active':'') + '" onclick="switchDetailView(\'timeline\')">&#x1F4C5; Tidslinje</button>' +
      '</div>' +
      '<select class="sort-select" id="sort-select" onchange="onSortChange()">' +
        '<option value="default"' + (currentSort==='default' ?' selected':'') + '>Standard</option>' +
        '<option value="roi"'    + (currentSort==='roi'     ?' selected':'') + '>ROI (høj→lav)</option>' +
        '<option value="cost"'   + (currentSort==='cost'    ?' selected':'') + '>Pris (lav→høj)</option>' +
        '<option value="horizon"'+ (currentSort==='horizon' ?' selected':'') + '>Tidshorisont</option>' +
        '<option value="deadline"'+(currentSort==='deadline'?' selected':'') + '>Deadline</option>' +
      '</select>' +
    '</div>' +

    buildFilterRowHtml() +

    '<div id="view-container"></div>';

  renderDetailView(sorted, wsId);
}

function buildFilterRowHtml() {
  var cf = currentFilters;

  function pills(options, key, dataKey) {
    return options.map(function(o){
      return '<button class="fp-btn' + (cf[key]===o.v?' active':'') + '" data-' + dataKey + '="' + o.v + '" onclick="setFilter(\'' + key + '\',this,\'' + dataKey + '\')">' + o.l + '</button>';
    }).join('');
  }

  function colorPills(key) {
    var opts = [
      { v:'all',    l:'Alle' },
      { v:'lav',    l:'<span class="circle-dot green"></span>Lav' },
      { v:'middel', l:'<span class="circle-dot yellow"></span>Middel' },
      { v:'høj',    l:'<span class="circle-dot red"></span>Høj' },
    ];
    return opts.map(function(o){
      return '<button class="fp-btn' + (cf[key]===o.v?' active':'') + '" data-' + key + '="' + o.v + '" onclick="setFilter(\'' + key + '\',this,\'' + key + '\')">' + o.l + '</button>';
    }).join('');
  }

  return '<div class="detail-filter-row">' +
    '<div class="fp-group"><span class="fp-label">Målgruppe</span>' +
      pills([{v:'all',l:'Alle'},{v:'sponsor',l:'Sponsor'},{v:'fan',l:'Fan'},{v:'frivillig',l:'Frivillig'}],'audience','aud') +
    '</div>' +
    '<div class="fp-sep"></div>' +
    '<div class="fp-group"><span class="fp-label">Status</span>' +
      pills([{v:'all',l:'Alle'},{v:'ide',l:'Idé'},{v:'planlagt',l:'Planlagt'},{v:'igang',l:'Igang'},{v:'afsluttet',l:'Afsluttet'}],'status','status') +
    '</div>' +
    '<div class="fp-sep"></div>' +
    '<div class="fp-group"><span class="fp-label">Horisont</span>' +
      pills([{v:'all',l:'Alle'},{v:'dage',l:'Dage'},{v:'uger',l:'Uger'},{v:'måneder',l:'Måneder'},{v:'år',l:'År'}],'horizon','horizon') +
    '</div>' +
    '<div class="fp-sep"></div>' +
    '<div class="fp-group"><span class="fp-label">Vanskelighed</span>' + colorPills('impl') + '</div>' +
    '<div class="fp-sep"></div>' +
    '<div class="fp-group"><span class="fp-label">Effekt</span>' + colorPills('effect') + '</div>' +
    '<div class="fp-sep"></div>' +
    '<div class="fp-group"><span class="fp-label">Deadline</span>' +
      pills([{v:'all',l:'Alle'},{v:'has',l:'Har deadline'},{v:'none',l:'Ingen'}],'deadline','deadline') +
    '</div>' +
    '<button class="btn-reset-filters" onclick="resetFilters()">&#x21BA; Nulstil</button>' +
    '</div>';
}

function switchDetailView(view) {
  appState.detailView = view;
  renderWorkspaceDetail(document.getElementById('main-content'), appState.workspaceId);
}

function renderDetailView(sorted, wsId) {
  var vc = document.getElementById('view-container');
  if (!vc) return;
  if (appState.detailView === 'list')          renderListView(vc, sorted, wsId);
  else if (appState.detailView === 'kanban')   renderKanbanView(vc, sorted, wsId);
  else if (appState.detailView === 'timeline') renderTimelineView(vc, sorted);
}

// ===== LIST VIEW =====
function renderListView(container, initiatives, wsId) {
  if (initiatives.length === 0) {
    container.innerHTML = '<div class="list-view"><div class="empty-state">Ingen initiativer matcher dine filtre.</div></div>';
    return;
  }
  var rows = initiatives.map(function(i){
    var aud = i.audiences.filter(function(a){ return a !== 'all'; })
      .map(function(a){ return a.charAt(0).toUpperCase() + a.slice(1); }).join(', ') || '—';
    return '<tr class="status-' + i.status + '">' +
      '<td>' + i.id + '</td>' +
      '<td><strong>' + escHtml(i.title) + '</strong>' +
        (i.shortDesc ? '<br><small style="color:var(--text-muted)">' + escHtml(i.shortDesc) + '</small>' : '') +
      '</td>' +
      '<td><span class="status-badge status-' + i.status + '">' + statusLabel(i.status) + '</span></td>' +
      '<td>' + aud + '</td>' +
      '<td>' + (i.roi||0) + '</td>' +
      '<td>' + (i.cost||0).toLocaleString('da-DK') + '</td>' +
      '<td>' + horizonLabel(i.timeHorizon) + '</td>' +
      '<td><span class="impl-badge ' + implClass(i.impl) + '"><span class="badge-dot ' + implDotClass(i.impl) + '"></span>' + implLabel(i.impl) + '</span></td>' +
      '<td><span class="impl-badge ' + implClass(i.effect) + '"><span class="badge-dot ' + implDotClass(i.effect) + '"></span>' + implLabel(i.effect) + '</span></td>' +
      '<td>' + (i.deadline || '—') + '</td>' +
      '<td style="white-space:nowrap;">' +
        '<button class="action-btn" onclick="cycleInitiativeStatus(' + wsId + ',' + i.id + ')" title="Næste status">&#x1F504;</button> ' +
        '<button class="action-btn" onclick="deleteInitiative(' + wsId + ',' + i.id + ')" title="Slet">&#x1F5D1;&#xFE0F;</button>' +
      '</td>' +
      '</tr>';
  }).join('');

  container.innerHTML =
    '<div class="list-view">' +
    '<table class="data-table"><thead><tr>' +
      '<th>#</th><th>Titel</th><th>Status</th><th>Målgruppe</th>' +
      '<th>ROI</th><th>Pris (DKK)</th><th>Horisont</th>' +
      '<th>Vanskelighed</th><th>Effekt</th><th>Deadline</th><th>Handlinger</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

// ===== KANBAN VIEW =====
function renderKanbanView(container, initiatives, wsId) {
  var colsHtml = KANBAN_COLS.map(function(col){
    var cards = initiatives.filter(function(i){ return i.status === col.id; });
    var cardsHtml = cards.length === 0
      ? '<div class="kanban-empty">Ingen initiativer</div>'
      : cards.map(function(i){
          var dl = i.deadline ? '<span class="impl-badge deadline-badge">&#x1F4C5; ' + escHtml(i.deadline) + '</span>' : '';
          return '<div class="kanban-card">' +
            '<div class="kc-title">' + escHtml(i.title) + '</div>' +
            '<div class="kc-badges">' +
              '<span class="impl-badge ' + implClass(i.impl) + '"><span class="badge-dot ' + implDotClass(i.impl) + '"></span>' + implLabel(i.impl) + '</span>' +
              '<span class="impl-badge ' + implClass(i.effect) + '"><span class="badge-dot ' + implDotClass(i.effect) + '"></span>' + implLabel(i.effect) + ' effekt</span>' +
              '<span class="impl-badge horizon-badge">&#x23F1;&#xFE0F; ' + horizonLabel(i.timeHorizon) + '</span>' +
              dl +
            '</div>' +
            '<div class="kc-footer">' +
              '<div class="kc-roi">ROI <div class="roi-mini-track"><div class="roi-mini-fill" style="width:' + ((i.roi||0)*10) + '%"></div></div><span>' + (i.roi||0) + '</span></div>' +
              '<div class="kc-actions">' +
                '<button class="kc-action-btn" onclick="cycleInitiativeStatus(' + wsId + ',' + i.id + ')" title="Næste status">&#x1F504;</button>' +
                '<button class="kc-action-btn" onclick="deleteInitiative(' + wsId + ',' + i.id + ')" title="Slet">&#x1F5D1;&#xFE0F;</button>' +
              '</div>' +
            '</div>' +
            '</div>';
        }).join('');

    return '<div class="kanban-col">' +
      '<div class="kanban-col-header">' +
        '<span class="kanban-col-dot ' + col.dotClass + '"></span>' +
        '<span class="kanban-col-title">' + col.label + '</span>' +
        '<span class="kanban-col-count">' + cards.length + '</span>' +
      '</div>' +
      '<div class="kanban-col-body">' + cardsHtml + '</div>' +
      '</div>';
  }).join('');

  container.innerHTML = '<div class="kanban-view"><div class="kanban-board">' + colsHtml + '</div></div>';
}

// ===== TIMELINE VIEW =====
function renderTimelineView(container, initiatives) {
  var sorted = initiatives.slice().sort(function(a, b){
    if (!a.deadline && !b.deadline)
      return (HORIZON_ORDER[a.timeHorizon||'uger']||0) - (HORIZON_ORDER[b.timeHorizon||'uger']||0);
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline) - new Date(b.deadline);
  });

  if (sorted.length === 0) {
    container.innerHTML = '<div class="timeline-view"><div class="timeline-empty">Ingen initiativer matcher dine filtre.</div></div>';
    return;
  }

  var itemsHtml = sorted.map(function(i, idx){
    var side = idx % 2 === 0 ? 't-left' : 't-right';
    var period = horizonLabel(i.timeHorizon) + (i.deadline ? ' &middot; Deadline: ' + escHtml(i.deadline) : '');
    return '<div class="timeline-item ' + side + '">' +
      '<div class="timeline-marker"></div>' +
      '<div class="timeline-box">' +
        '<div class="timeline-period">' + period + '</div>' +
        '<h3>' + escHtml(i.title) + '</h3>' +
        '<p>' + escHtml(i.shortDesc) + '</p>' +
        '<div style="margin-top:0.5rem;display:flex;gap:5px;flex-wrap:wrap;">' +
          '<span class="status-badge status-' + i.status + '">' + statusLabel(i.status) + '</span>' +
          '<span class="impl-badge ' + implClass(i.impl) + '"><span class="badge-dot ' + implDotClass(i.impl) + '"></span>' + implLabel(i.impl) + '</span>' +
          '<span class="impl-badge ' + implClass(i.effect) + '"><span class="badge-dot ' + implDotClass(i.effect) + '"></span>' + implLabel(i.effect) + ' effekt</span>' +
        '</div>' +
      '</div>' +
      '</div>';
  }).join('');

  container.innerHTML =
    '<div class="timeline-view">' +
      '<div class="timeline-track">' +
        '<div class="timeline-line"></div>' +
        '<div class="timeline-items">' + itemsHtml + '</div>' +
      '</div>' +
    '</div>';
}

// ===== FILTERING =====
function setFilter(filterKey, btn, dataAttr) {
  currentFilters[filterKey] = btn.dataset[dataAttr];
  // Update active state within this group only
  var group = btn.closest('.fp-group');
  if (group) {
    group.querySelectorAll('.fp-btn').forEach(function(b){ b.classList.toggle('active', b === btn); });
  }
  // Re-render view
  var ws = getWorkspace(appState.workspaceId);
  if (!ws) return;
  renderDetailView(getSortedInitiatives(getFilteredInitiatives(ws.initiatives)), appState.workspaceId);
}

function getFilteredInitiatives(initiatives) {
  var f  = initiatives;
  var cf = currentFilters;
  if (cf.audience !== 'all') f = f.filter(function(i){ return i.audiences.indexOf(cf.audience) >= 0 || i.audiences.indexOf('all') >= 0; });
  if (cf.status   !== 'all') f = f.filter(function(i){ return i.status === cf.status; });
  if (cf.horizon  !== 'all') f = f.filter(function(i){ return i.timeHorizon === cf.horizon; });
  if (cf.impl     !== 'all') f = f.filter(function(i){ return i.impl === cf.impl; });
  if (cf.effect   !== 'all') f = f.filter(function(i){ return i.effect === cf.effect; });
  if (cf.deadline === 'has')  f = f.filter(function(i){ return i.deadline && i.deadline !== ''; });
  if (cf.deadline === 'none') f = f.filter(function(i){ return !i.deadline || i.deadline === ''; });
  return f;
}

function getSortedInitiatives(initiatives) {
  var sorted = initiatives.slice();
  switch (currentSort) {
    case 'roi':      sorted.sort(function(a,b){ return (b.roi||0) - (a.roi||0); }); break;
    case 'cost':     sorted.sort(function(a,b){ return (a.cost||0) - (b.cost||0); }); break;
    case 'horizon':  sorted.sort(function(a,b){ return (HORIZON_ORDER[a.timeHorizon]||0) - (HORIZON_ORDER[b.timeHorizon]||0); }); break;
    case 'deadline': sorted.sort(function(a,b){
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline) - new Date(b.deadline);
    }); break;
    default: sorted.sort(function(a,b){ return a.id - b.id; });
  }
  return sorted;
}

function onSortChange() {
  var sel = document.getElementById('sort-select');
  if (sel) currentSort = sel.value;
  var ws = getWorkspace(appState.workspaceId);
  if (!ws) return;
  renderDetailView(getSortedInitiatives(getFilteredInitiatives(ws.initiatives)), appState.workspaceId);
}

function resetFilters() {
  currentFilters = { audience: 'all', status: 'all', horizon: 'all', impl: 'all', effect: 'all', deadline: 'all' };
  currentSort    = 'default';
  renderMain();
}

// ===== WORKSPACE CRUD =====
function openNewWorkspaceModal() {
  modalOpen = true;
  document.getElementById('wsIcon').value = '📋';
  document.getElementById('wsName').value = '';
  document.getElementById('wsDesc').value = '';
  document.getElementById('newWorkspaceModal').style.display = 'block';
  setTimeout(function(){ document.getElementById('wsName').focus(); }, 50);
}

function closeNewWorkspaceModal() {
  modalOpen = false;
  document.getElementById('newWorkspaceModal').style.display = 'none';
}

function saveNewWorkspace() {
  var name = document.getElementById('wsName').value.trim();
  if (!name) { alert('Angiv et navn for arbejdsområdet.'); return; }

  var payload = {
    icon:        document.getElementById('wsIcon').value.trim() || '📋',
    name:        name,
    description: document.getElementById('wsDesc').value.trim(),
  };

  apiFetch('workspaces', { method: 'POST', body: payload })
    .then(function(ws) {
      ws.initiatives = ws.initiatives || [];
      workspaces.push(ws);
      closeNewWorkspaceModal();
      renderSidebar();
      renderMain();
    })
    .catch(function(err) {
      alert('Kunne ikke gemme arbejdsområdet: ' + err.message);
    });
}

// ===== INITIATIVE CRUD =====
function openNewInitiativeModal(wsId) {
  modalOpen = true;
  newInitiativeWsId = wsId;
  document.getElementById('initTitle').value       = '';
  document.getElementById('initStatus').value      = 'ide';
  document.getElementById('initShortDesc').value   = '';
  document.getElementById('initDetails').value     = '';
  document.getElementById('initImpact').value      = '';
  document.getElementById('initROI').value         = '7';
  document.getElementById('initCost').value        = '';
  document.getElementById('initDeadline').value    = '';
  document.getElementById('initTimeHorizon').value = '1';
  document.getElementById('initTimeHorizonLabel').textContent = 'Uger';
  document.getElementById('initImpl').value   = 'lav';
  document.getElementById('initEffect').value = 'lav';
  document.querySelectorAll('#initImplCircles .circ-btn').forEach(function(b,i){ b.classList.toggle('selected', i===0); });
  document.querySelectorAll('#initEffectCircles .circ-btn').forEach(function(b,i){ b.classList.toggle('selected', i===0); });
  document.querySelectorAll('#newInitiativeModal .form-checkbox input').forEach(function(cb){ cb.checked = false; });
  document.getElementById('newInitiativeModal').style.display = 'block';
  setTimeout(function(){ document.getElementById('initTitle').focus(); }, 50);
}

function closeNewInitiativeModal() {
  modalOpen = false;
  document.getElementById('newInitiativeModal').style.display = 'none';
  newInitiativeWsId = null;
}

function saveNewInitiative() {
  var title = document.getElementById('initTitle').value.trim();
  if (!title) { alert('Tilføj en titel!'); return; }
  var ws = getWorkspace(newInitiativeWsId);
  if (!ws) return;

  var audiences = [];
  if (document.getElementById('initAudSponsor').checked)   audiences.push('sponsor');
  if (document.getElementById('initAudFan').checked)       audiences.push('fan');
  if (document.getElementById('initAudFrivillig').checked) audiences.push('frivillig');

  var horizonIdx = parseInt(document.getElementById('initTimeHorizon').value, 10);

  var payload = {
    workspaceId:  newInitiativeWsId,
    title:        title,
    status:       document.getElementById('initStatus').value,
    shortDesc:    document.getElementById('initShortDesc').value.trim(),
    details:      document.getElementById('initDetails').value.trim(),
    impact:       document.getElementById('initImpact').value.trim(),
    roi:          Math.min(10, Math.max(0, parseInt(document.getElementById('initROI').value, 10) || 0)),
    cost:         parseInt(document.getElementById('initCost').value, 10) || 0,
    impl:         document.getElementById('initImpl').value,
    effect:       document.getElementById('initEffect').value,
    deadline:     document.getElementById('initDeadline').value,
    timeHorizon:  HORIZON_VALUES[horizonIdx],
    audiences:    audiences.length > 0 ? audiences : ['all'],
  };

  apiFetch('initiatives', { method: 'POST', body: payload })
    .then(function(initiative) {
      ws.initiatives.push(initiative);
      closeNewInitiativeModal();
      renderSidebar();
      renderMain();
    })
    .catch(function(err) {
      alert('Kunne ikke gemme initiativet: ' + err.message);
    });
}

function cycleInitiativeStatus(wsId, initId) {
  var ws = getWorkspace(wsId);
  if (!ws) return;
  var init = ws.initiatives.filter(function(i){ return i.id === initId; })[0];
  if (!init) return;
  var order = ['ide', 'planlagt', 'igang', 'afsluttet'];
  var idx   = order.indexOf(init.status);
  var newStatus = order[(idx + 1) % order.length];

  apiFetch('initiatives/' + initId, { method: 'PATCH', body: { status: newStatus } })
    .then(function(updated) {
      Object.assign(init, updated);
      renderSidebar();
      renderMain();
    })
    .catch(function(err) {
      alert('Kunne ikke opdatere status: ' + err.message);
    });
}

function deleteInitiative(wsId, initId) {
  if (!confirm('Er du sikker på, at du vil slette dette initiativ?')) return;
  var ws = getWorkspace(wsId);
  if (!ws) return;

  apiFetch('initiatives/' + initId, { method: 'DELETE' })
    .then(function() {
      ws.initiatives = ws.initiatives.filter(function(i){ return i.id !== initId; });
      renderSidebar();
      renderMain();
    })
    .catch(function(err) {
      alert('Kunne ikke slette initiativet: ' + err.message);
    });
}

// ===== FORM CONTROLS SETUP =====
function setupFormControls() {
  [['#initImplCircles', 'initImpl'], ['#initEffectCircles', 'initEffect']].forEach(function(pair){
    var sel      = pair[0];
    var hiddenId = pair[1];
    document.querySelectorAll(sel + ' .circ-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        document.querySelectorAll(sel + ' .circ-btn').forEach(function(b){ b.classList.remove('selected'); });
        this.classList.add('selected');
        document.getElementById(hiddenId).value = this.dataset.val;
      });
    });
  });

  var slider = document.getElementById('initTimeHorizon');
  var label  = document.getElementById('initTimeHorizonLabel');
  if (slider) {
    slider.addEventListener('input', function(){ label.textContent = HORIZON_LABELS[this.value]; });
  }
}

// ===== OUTSIDE CLICK CLOSES MODALS =====
window.onclick = function(e) {
  ['newWorkspaceModal', 'newInitiativeModal'].forEach(function(id){
    var m = document.getElementById(id);
    if (e.target === m) {
      m.style.display = 'none';
      modalOpen = false;
      if (id === 'newInitiativeModal') newInitiativeWsId = null;
    }
  });
};

// ===== UPDATE HEADER USER INFO =====
function updateHeaderUser() {
  var nameEl  = document.querySelector('.gh-user-name');
  var emailEl = document.querySelector('.gh-user-email');
  var avatarEl = document.querySelector('.gh-avatar');
  if (nameEl  && CURRENT_USER.name)  nameEl.textContent  = CURRENT_USER.name;
  if (emailEl && CURRENT_USER.email) emailEl.textContent = CURRENT_USER.email;
  if (avatarEl && CURRENT_USER.name) {
    avatarEl.textContent = CURRENT_USER.name
      .split(' ').map(function(p){ return p[0] || ''; }).join('').toUpperCase().slice(0,2);
  }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', function() {
  setupFormControls();
  updateHeaderUser();
  loadWorkspacesFromServer().then(function() {
    renderSidebar();
    renderMain();
    startPolling();
  });
});
