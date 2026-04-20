/* ===== Skeleton Team App – app.js ===== */
/* Bundled as a plain IIFE so all symbols are safely encapsulated,
   then the functions needed by inline onclick= are exported to window. */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // CONFIG (injected by wp_localize_script as window.skeletonConfig)
  // ---------------------------------------------------------------------------
  var cfg = window.skeletonConfig || { restUrl: '/wp-json/skeleton/v1/', nonce: '', demoMode: '0' };
  var REST      = cfg.restUrl;
  var WP_NONCE  = cfg.nonce;
  var DEMO_MODE = cfg.demoMode === '1';

  // ---------------------------------------------------------------------------
  // CONSTANTS
  // ---------------------------------------------------------------------------
  var HORIZON_LABELS = ['Dage', 'Uger', 'Måneder', 'År'];
  var HORIZON_VALUES = ['dage', 'uger', 'måneder', 'år'];
  var HORIZON_ORDER  = { dage: 0, uger: 1, måneder: 2, år: 3 };

  var KANBAN_COLS = [
    { id: 'ide',       label: 'Idé',       dotClass: 'dot-ide' },
    { id: 'planlagt',  label: 'Planlagt',  dotClass: 'dot-planlagt' },
    { id: 'igang',     label: 'Igang',     dotClass: 'dot-igang' },
    { id: 'afsluttet', label: 'Afsluttet', dotClass: 'dot-afsluttet' },
  ];

  // ---------------------------------------------------------------------------
  // TIMER STATE
  // ---------------------------------------------------------------------------
  var timerInterval = null;
  var timerSeconds  = 0;
  var timerRunning  = false;

  function timerPad(n) { return n < 10 ? '0' + String(n) : String(n); }
  function timerFormat(s) {
    var h   = Math.floor(s / 3600);
    var m   = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    return (h > 0 ? timerPad(h) + ':' : '') + timerPad(m) + ':' + timerPad(sec);
  }

  function startTimer() {
    if (timerRunning) return;
    timerRunning = true;
    timerInterval = setInterval(function () {
      timerSeconds++;
      var el = document.getElementById('sk-timer-display');
      if (el) el.textContent = timerFormat(timerSeconds);
      var lbl = document.getElementById('sk-timer-status-label');
      if (lbl) lbl.textContent = 'Tidsregistrering kører…';
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerRunning = false;
    var lbl = document.getElementById('sk-timer-status-label');
    if (lbl) lbl.textContent = timerSeconds > 0 ? timerFormat(timerSeconds) + ' registreret' : 'Klar til start';
  }

  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------
  var workspaces       = [];
  var nextWorkspaceId  = 1;
  var nextInitiativeId = 1;

  var appState = {
    page:        'dashboard',
    workspaceId: null,
    detailView:  'kanban',
    loading:     false,
    lastSynced:  null,
  };

  var currentFilters = {
    audience: 'all', status: 'all', horizon: 'all',
    impl: 'all', effect: 'all', deadline: 'all',
  };
  var currentSort       = 'default';
  var newInitiativeWsId = null;

  // ---------------------------------------------------------------------------
  // TOAST NOTIFICATIONS
  // ---------------------------------------------------------------------------
  function showToast(msg, type) {
    var container = document.getElementById('skeleton-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'skeleton-toast-container';
      document.body.appendChild(container);
    }
    var toast = document.createElement('div');
    toast.className = 'skeleton-toast' + (type ? ' toast-' + type : '');
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);
  }

  // ---------------------------------------------------------------------------
  // REST API HELPERS
  // ---------------------------------------------------------------------------
  function apiFetch(method, path, body) {
    var opts = {
      method:  method,
      headers: {
        'Content-Type':  'application/json',
        'X-WP-Nonce':    WP_NONCE,
      },
    };
    if (body) opts.body = JSON.stringify(body);
    return fetch(REST + path, opts).then(function (r) {
      if (!r.ok) {
        return r.json().then(function (e) {
          throw new Error(e.message || 'Netværksfejl (' + r.status + ')');
        }).catch(function () {
          throw new Error('Netværksfejl (' + r.status + ')');
        });
      }
      return r.json();
    });
  }

  function loadWorkspaces() {
    return apiFetch('GET', 'workspaces').then(function (rows) {
      return Promise.all(rows.map(function (ws) {
        return apiFetch('GET', 'workspaces/' + ws.id + '/initiatives').then(function (inits) {
          return Object.assign({}, ws, {
            initiatives: inits.map(function (i) {
              return Object.assign({}, i, {
                audiences: Array.isArray(i.audiences) ? i.audiences : (i.audiences || 'all').split(','),
              });
            }),
          });
        });
      }));
    });
  }

  function refreshData() {
    return loadWorkspaces().then(function (ws) {
      workspaces = ws;
      // Recompute auto-increment counters so new items don't collide.
      var maxWs   = workspaces.reduce(function (m, w) { return Math.max(m, w.id); }, 0);
      var maxInit = workspaces.reduce(function (m, w) {
        return w.initiatives.reduce(function (mm, i) { return Math.max(mm, i.id); }, m);
      }, 0);
      nextWorkspaceId  = maxWs + 1;
      nextInitiativeId = maxInit + 1;
      appState.lastSynced = new Date();
      renderSidebar();
      renderMain();
    }).catch(function (err) {
      console.error('[Skeleton] Load failed:', err);
      showToast('Kunne ikke hente data: ' + err.message, 'error');
    });
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------
  function implClass(v)    { return v === 'lav' ? 'impl-low' : v === 'middel' ? 'impl-mid' : 'impl-high'; }
  function implDotClass(v) { return v === 'lav' ? 'green' : v === 'middel' ? 'yellow' : 'red'; }
  function implLabel(v)    { return v === 'lav' ? 'Lav' : v === 'middel' ? 'Middel' : 'Høj'; }
  function horizonLabel(v) { if (!v) return 'Uger'; return v.charAt(0).toUpperCase() + v.slice(1); }
  function statusLabel(s) {
    return { ide: 'Idé', planlagt: 'Planlagt', igang: 'Igang', afsluttet: 'Afsluttet' }[s] || s;
  }

  function getWorkspace(id) { return workspaces.find(function (ws) { return ws.id === id; }); }

  function getAllInitiatives() {
    return workspaces.reduce(function (acc, ws) {
      return acc.concat(ws.initiatives.map(function (i) {
        return Object.assign({}, i, { workspaceName: ws.name, workspaceIcon: ws.icon });
      }));
    }, []);
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---------------------------------------------------------------------------
  // NAVIGATION
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // SIDEBAR
  // ---------------------------------------------------------------------------
  function renderSidebar() {
    var navDash = document.getElementById('sk-nav-dashboard');
    var navWs   = document.getElementById('sk-nav-workspaces');
    if (navDash) navDash.classList.toggle('active', appState.page === 'dashboard');
    if (navWs)   navWs.classList.toggle('active', appState.page === 'workspaces');

    var list = document.getElementById('sk-sidebar-ws-list');
    if (!list) return;
    list.innerHTML = '';
    workspaces.forEach(function (ws) {
      var el = document.createElement('div');
      el.className = 'sidebar-ws-item' + (appState.workspaceId === ws.id ? ' active' : '');
      el.innerHTML =
        '<span class="sidebar-ws-icon">' + ws.icon + '</span>' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(ws.name) + '</span>' +
        '<span class="sidebar-ws-count">' + ws.initiatives.length + '</span>';
      el.onclick = (function (id) { return function () { navigate('workspace', id); }; })(ws.id);
      list.appendChild(el);
    });
  }

  // ---------------------------------------------------------------------------
  // MAIN RENDER DISPATCHER
  // ---------------------------------------------------------------------------
  function renderMain() {
    var mc = document.getElementById('sk-main-content');
    if (!mc) return;
    if (appState.page === 'dashboard')   renderDashboard(mc);
    else if (appState.page === 'workspaces') renderWorkspacesOverview(mc);
    else if (appState.page === 'workspace')  renderWorkspaceDetail(mc, appState.workspaceId);
  }

  // ---------------------------------------------------------------------------
  // A) DASHBOARD
  // ---------------------------------------------------------------------------
  function renderDashboard(container) {
    var all         = getAllInitiatives();
    var activeCount = all.filter(function (i) { return i.status !== 'afsluttet'; }).length;
    var inProgress  = all.filter(function (i) { return i.status === 'igang'; }).length;
    var totalCost   = all.reduce(function (s, i) { return s + (i.cost || 0); }, 0);
    var avgROI      = all.length > 0
      ? (all.reduce(function (s, i) { return s + (i.roi || 0); }, 0) / all.length).toFixed(1)
      : '—';

    var now  = new Date();
    var soon = all
      .filter(function (i) { return i.deadline && i.status !== 'afsluttet'; })
      .map(function (i) { return Object.assign({}, i, { daysLeft: Math.ceil((new Date(i.deadline) - now) / 86400000) }); })
      .filter(function (i) { return i.daysLeft <= 30; })
      .sort(function (a, b) { return a.daysLeft - b.daysLeft; });

    // Format Danish date
    var dkMonths = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
    function fmtDkDate(iso) {
      if (!iso) return '';
      var parts = iso.split('-');
      var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return d.getDate() + '. ' + dkMonths[d.getMonth()] + ' ' + d.getFullYear();
    }

    // Deadline list
    var deadlineHtml = soon.length === 0
      ? '<div style="padding:1rem 0;color:var(--text-muted);font-size:13px;">Ingen kommende deadlines inden for 30 dage.</div>'
      : soon.slice(0, 5).map(function (i) {
          var left = i.daysLeft <= 0 ? 'Overskredet' : i.daysLeft + ' dage tilbage';
          return '<div class="dash-deadline-item">' +
            '<div class="dl-task-icon">📋</div>' +
            '<div class="dl-info">' +
              '<div class="dl-title">' + escHtml(i.title) + '</div>' +
              '<div class="dl-ws">' + i.workspaceIcon + ' ' + escHtml(i.workspaceName) + ' · ' + left + '</div>' +
            '</div>' +
            '<div class="dl-date">' + fmtDkDate(i.deadline) + '</div>' +
            '</div>';
        }).join('');

    // Workspace cards
    var wsHtml;
    if (workspaces.length === 0) {
      wsHtml = '<div class="empty-state">Ingen arbejdsområder endnu.<br>' +
        '<button class="btn-primary" style="margin-top:1rem;" onclick="window.skNavigate(\'workspaces\')">+ Nyt arbejdsområde</button></div>';
    } else {
      wsHtml = '<div class="ws-grid dash-ws-grid">' +
        workspaces.map(function (ws) {
          var active = ws.initiatives.filter(function (i) { return i.status !== 'afsluttet'; }).length;
          return '<div class="ws-card" onclick="window.skNavigate(\'workspace\',' + ws.id + ')">' +
            '<div class="ws-card-icon">' + ws.icon + '</div>' +
            '<div class="ws-card-name">' + escHtml(ws.name) + '</div>' +
            '<div class="ws-card-desc">' + escHtml(ws.description) + '</div>' +
            '<div class="ws-card-meta"><strong>' + ws.initiatives.length + '</strong> initiativer · ' + active + ' aktive</div>' +
            '</div>';
        }).join('') +
        '</div>';
    }

    // Progress ring – computed from real data
    var totalAll      = all.length;
    var doneCount     = all.filter(function (i) { return i.status === 'afsluttet'; }).length;
    var ringPct       = totalAll > 0 ? Math.round((doneCount / totalAll) * 100) : 0;
    var ringR         = 46;
    var ringCirc      = 2 * Math.PI * ringR;
    var ringOff       = ringCirc * (1 - ringPct / 100);
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

    // Recent activity – sorted by updatedAt/createdAt, real data only
    var recentInitiatives = all
      .slice()
      .sort(function (a, b) {
        var ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
        var tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return tb - ta;
      })
      .slice(0, 5);

    var activityHtml;
    if (recentInitiatives.length === 0) {
      activityHtml = '<div style="padding:1rem 0;color:var(--text-muted);font-size:13px;">Ingen aktivitet endnu.</div>';
    } else {
      activityHtml = '<div class="activity-list">' +
        recentInitiatives.map(function (i) {
          var statusIcons = { ide: '💡', planlagt: '📅', igang: '⚡', afsluttet: '✅' };
          var icon = statusIcons[i.status] || '📋';
          var when = i.updatedAt || i.createdAt;
          var whenStr = when ? fmtDkDate(when.slice(0, 10)) : '';
          return '<div class="activity-item">' +
            '<div class="activity-avatar">' + icon + '</div>' +
            '<div class="activity-info">' +
              '<div class="activity-title">' + escHtml(i.title) + '</div>' +
              '<div class="activity-meta">' + i.workspaceIcon + ' ' + escHtml(i.workspaceName) +
                (whenStr ? ' · ' + whenStr : '') + '</div>' +
            '</div>' +
            '<span class="status-badge status-' + i.status + '">' + statusLabel(i.status) + '</span>' +
            '</div>';
        }).join('') +
        '</div>';
    }

    // Timer widget
    var timerHtml =
      '<div id="sk-timer-display" class="timer-display">' + timerFormat(timerSeconds) + '</div>' +
      '<div id="sk-timer-status-label" class="timer-label">' + (timerRunning ? 'Tidsregistrering kører…' : (timerSeconds > 0 ? timerFormat(timerSeconds) + ' registreret' : 'Klar til start')) + '</div>' +
      '<div class="timer-controls">' +
        '<button class="timer-btn timer-play" onclick="window.skStartTimer()">▶ Afspil</button>' +
        '<button class="timer-btn timer-stop" onclick="window.skStopTimer()">■ Stop</button>' +
      '</div>';

    // Last synced indicator
    var syncedHtml = appState.lastSynced
      ? '<span style="font-size:11px;color:var(--text-muted);margin-left:auto;">Sidst opdateret: ' +
          appState.lastSynced.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' }) + '</span>'
      : '';

    container.innerHTML =
      '<div class="topbar">' +
        '<div>' +
          '<div class="topbar-title">📊 Dashboard</div>' +
          '<div class="topbar-sub">Overblik over alle arbejdsområder og initiativer</div>' +
        '</div>' +
        syncedHtml +
      '</div>' +
      '<div class="page-body">' +

        // Stat cards
        '<div class="dash-stat-grid">' +
          '<div class="dash-stat-card">' +
            '<div class="dsc-header"><span class="dsc-icon">📁</span></div>' +
            '<div class="dsc-value">' + workspaces.length + '</div>' +
            '<div class="dsc-label">Arbejdsområder</div>' +
          '</div>' +
          '<div class="dash-stat-card">' +
            '<div class="dsc-header"><span class="dsc-icon">🚀</span></div>' +
            '<div class="dsc-value">' + activeCount + '</div>' +
            '<div class="dsc-label">Aktive initiativer</div>' +
          '</div>' +
          '<div class="dash-stat-card">' +
            '<div class="dsc-header"><span class="dsc-icon">⚡</span></div>' +
            '<div class="dsc-value">' + inProgress + '</div>' +
            '<div class="dsc-label">Igangværende</div>' +
          '</div>' +
          '<div class="dash-stat-card">' +
            '<div class="dsc-header"><span class="dsc-icon">📈</span></div>' +
            '<div class="dsc-value">' + avgROI + '</div>' +
            '<div class="dsc-label">Gns. ROI</div>' +
          '</div>' +
          '<div class="dash-stat-card">' +
            '<div class="dsc-header"><span class="dsc-icon">💰</span></div>' +
            '<div class="dsc-value" style="font-size:26px;">' + (totalCost > 0 ? totalCost.toLocaleString('da-DK') : '0') + '</div>' +
            '<div class="dsc-label">Estimeret pris (DKK)</div>' +
          '</div>' +
        '</div>' +

        // Row 1 widgets: Projektfremgang + Seneste aktivitet
        '<div class="dash-widget-grid-2">' +
          '<div class="dash-widget">' +
            '<div class="dash-widget-title"><span class="dash-widget-title-icon">🕐</span>Seneste aktivitet</div>' +
            activityHtml +
          '</div>' +
          '<div class="dash-widget">' +
            '<div class="dash-widget-title"><span class="dash-widget-title-icon">🎯</span>Projektfremgang</div>' +
            ringHtml +
          '</div>' +
        '</div>' +

        // Row 2 widgets: Kommende Deadlines + Tidsregistrering
        '<div class="dash-widget-grid" style="grid-template-columns:2fr 1fr;">' +
          '<div class="dash-widget">' +
            '<div class="dash-widget-title"><span class="dash-widget-title-icon">⏰</span>Kommende Deadlines</div>' +
            '<div class="dash-deadline-list">' + deadlineHtml + '</div>' +
          '</div>' +
          '<div class="dash-widget">' +
            '<div class="dash-widget-title"><span class="dash-widget-title-icon">⏱️</span>Tidsregistrering</div>' +
            timerHtml +
          '</div>' +
        '</div>' +

        // Workspace overview
        '<div class="dash-section-title">📁 Alle arbejdsområder</div>' +
        wsHtml +

      '</div>';
  }

  // ---------------------------------------------------------------------------
  // B) WORKSPACES OVERVIEW
  // ---------------------------------------------------------------------------
  function renderWorkspacesOverview(container) {
    var cardsHtml = workspaces.map(function (ws) {
      var active = ws.initiatives.filter(function (i) { return i.status !== 'afsluttet'; }).length;
      return '<div class="ws-card" onclick="window.skNavigate(\'workspace\',' + ws.id + ')">' +
        '<div class="ws-card-icon">' + ws.icon + '</div>' +
        '<div class="ws-card-name">' + escHtml(ws.name) + '</div>' +
        '<div class="ws-card-desc">' + escHtml(ws.description) + '</div>' +
        '<div class="ws-card-meta"><strong>' + ws.initiatives.length + '</strong> initiativer · ' + active + ' aktive</div>' +
        '</div>';
    }).join('');

    container.innerHTML =
      '<div class="topbar">' +
        '<div>' +
          '<div class="topbar-title">📁 Arbejdsområder</div>' +
          '<div class="topbar-sub">' + workspaces.length + ' arbejdsområde' + (workspaces.length !== 1 ? 'r' : '') + '</div>' +
        '</div>' +
        '<div class="topbar-actions"><button class="btn-primary" onclick="window.skOpenNewWorkspaceModal()">+ Nyt arbejdsområde</button></div>' +
      '</div>' +
      '<div class="page-body">' +
        '<div class="ws-grid">' +
          cardsHtml +
          '<div class="ws-card ws-add-card" onclick="window.skOpenNewWorkspaceModal()">' +
            '<div class="ws-add-plus">+</div>' +
            '<div class="ws-add-label">Nyt arbejdsområde</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  // ---------------------------------------------------------------------------
  // C) WORKSPACE DETAIL
  // ---------------------------------------------------------------------------
  function renderWorkspaceDetail(container, wsId) {
    var ws = getWorkspace(wsId);
    if (!ws) { navigate('workspaces'); return; }

    var filtered = getFilteredInitiatives(ws.initiatives);
    var sorted   = getSortedInitiatives(filtered);
    var view     = appState.detailView;

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
          '<button class="btn-primary" onclick="window.skOpenNewInitiativeModal(' + wsId + ')">+ Nyt initiativ</button>' +
        '</div>' +
      '</div>' +

      '<div class="detail-toolbar">' +
        '<div class="view-switcher">' +
          '<button class="vs-btn' + (view === 'list'     ? ' active' : '') + '" onclick="window.skSwitchDetailView(\'list\')">☰ Liste</button>' +
          '<button class="vs-btn' + (view === 'kanban'   ? ' active' : '') + '" onclick="window.skSwitchDetailView(\'kanban\')">📌 Kanban</button>' +
          '<button class="vs-btn' + (view === 'timeline' ? ' active' : '') + '" onclick="window.skSwitchDetailView(\'timeline\')">📅 Tidslinje</button>' +
        '</div>' +
        '<select class="sort-select" id="sk-sort-select" onchange="window.skOnSortChange()">' +
          '<option value="default"'  + (currentSort === 'default'  ? ' selected' : '') + '>Standard</option>' +
          '<option value="roi"'      + (currentSort === 'roi'      ? ' selected' : '') + '>ROI (høj→lav)</option>' +
          '<option value="cost"'     + (currentSort === 'cost'     ? ' selected' : '') + '>Pris (lav→høj)</option>' +
          '<option value="horizon"'  + (currentSort === 'horizon'  ? ' selected' : '') + '>Tidshorisont</option>' +
          '<option value="deadline"' + (currentSort === 'deadline' ? ' selected' : '') + '>Deadline</option>' +
        '</select>' +
      '</div>' +

      buildFilterRowHtml() +
      '<div id="sk-view-container"></div>';

    renderDetailView(sorted, wsId);
  }

  function buildFilterRowHtml() {
    var cf = currentFilters;

    function pills(options, key, dataKey) {
      return options.map(function (o) {
        return '<button class="fp-btn' + (cf[key] === o.v ? ' active' : '') + '" data-' + dataKey + '="' + o.v + '" onclick="window.skSetFilter(\'' + key + '\',this,\'' + dataKey + '\')">' + o.l + '</button>';
      }).join('');
    }

    function colorPills(key) {
      var opts = [
        { v: 'all',    l: 'Alle' },
        { v: 'lav',    l: '<span class="circle-dot green"></span>Lav' },
        { v: 'middel', l: '<span class="circle-dot yellow"></span>Middel' },
        { v: 'høj',    l: '<span class="circle-dot red"></span>Høj' },
      ];
      return opts.map(function (o) {
        return '<button class="fp-btn' + (cf[key] === o.v ? ' active' : '') + '" data-' + key + '="' + o.v + '" onclick="window.skSetFilter(\'' + key + '\',this,\'' + key + '\')">' + o.l + '</button>';
      }).join('');
    }

    return '<div class="detail-filter-row">' +
      '<div class="fp-group"><span class="fp-label">Målgruppe</span>' +
        pills([{ v: 'all', l: 'Alle' }, { v: 'sponsor', l: 'Sponsor' }, { v: 'fan', l: 'Fan' }, { v: 'frivillig', l: 'Frivillig' }], 'audience', 'aud') +
      '</div>' +
      '<div class="fp-sep"></div>' +
      '<div class="fp-group"><span class="fp-label">Status</span>' +
        pills([{ v: 'all', l: 'Alle' }, { v: 'ide', l: 'Idé' }, { v: 'planlagt', l: 'Planlagt' }, { v: 'igang', l: 'Igang' }, { v: 'afsluttet', l: 'Afsluttet' }], 'status', 'status') +
      '</div>' +
      '<div class="fp-sep"></div>' +
      '<div class="fp-group"><span class="fp-label">Horisont</span>' +
        pills([{ v: 'all', l: 'Alle' }, { v: 'dage', l: 'Dage' }, { v: 'uger', l: 'Uger' }, { v: 'måneder', l: 'Måneder' }, { v: 'år', l: 'År' }], 'horizon', 'horizon') +
      '</div>' +
      '<div class="fp-sep"></div>' +
      '<div class="fp-group"><span class="fp-label">Vanskelighed</span>' + colorPills('impl') + '</div>' +
      '<div class="fp-sep"></div>' +
      '<div class="fp-group"><span class="fp-label">Effekt</span>' + colorPills('effect') + '</div>' +
      '<div class="fp-sep"></div>' +
      '<div class="fp-group"><span class="fp-label">Deadline</span>' +
        pills([{ v: 'all', l: 'Alle' }, { v: 'has', l: 'Har deadline' }, { v: 'none', l: 'Ingen' }], 'deadline', 'deadline') +
      '</div>' +
      '<button class="btn-reset-filters" onclick="window.skResetFilters()">↺ Nulstil</button>' +
      '</div>';
  }

  function switchDetailView(view) {
    appState.detailView = view;
    renderWorkspaceDetail(document.getElementById('sk-main-content'), appState.workspaceId);
  }

  function renderDetailView(sorted, wsId) {
    var vc = document.getElementById('sk-view-container');
    if (!vc) return;
    if (appState.detailView === 'list')          renderListView(vc, sorted, wsId);
    else if (appState.detailView === 'kanban')   renderKanbanView(vc, sorted, wsId);
    else if (appState.detailView === 'timeline') renderTimelineView(vc, sorted);
  }

  // ---------------------------------------------------------------------------
  // LIST VIEW
  // ---------------------------------------------------------------------------
  function renderListView(container, initiatives, wsId) {
    if (initiatives.length === 0) {
      container.innerHTML = '<div class="list-view"><div class="empty-state">Ingen initiativer matcher dine filtre.</div></div>';
      return;
    }
    var rows = initiatives.map(function (i) {
      var aud = (Array.isArray(i.audiences) ? i.audiences : [i.audiences])
        .filter(function (a) { return a !== 'all'; })
        .map(function (a) { return a.charAt(0).toUpperCase() + a.slice(1); })
        .join(', ') || '—';
      return '<tr class="status-' + i.status + '">' +
        '<td>' + i.id + '</td>' +
        '<td><strong>' + escHtml(i.title) + '</strong>' +
          (i.shortDesc ? '<br><small style="color:var(--text-muted)">' + escHtml(i.shortDesc) + '</small>' : '') +
        '</td>' +
        '<td><span class="status-badge status-' + i.status + '">' + statusLabel(i.status) + '</span></td>' +
        '<td>' + aud + '</td>' +
        '<td>' + (i.roi || 0) + '</td>' +
        '<td>' + (i.cost || 0).toLocaleString('da-DK') + '</td>' +
        '<td>' + horizonLabel(i.timeHorizon) + '</td>' +
        '<td><span class="impl-badge ' + implClass(i.impl) + '"><span class="badge-dot ' + implDotClass(i.impl) + '"></span>' + implLabel(i.impl) + '</span></td>' +
        '<td><span class="impl-badge ' + implClass(i.effect) + '"><span class="badge-dot ' + implDotClass(i.effect) + '"></span>' + implLabel(i.effect) + '</span></td>' +
        '<td>' + (i.deadline || '—') + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<button class="action-btn" onclick="window.skCycleInitiativeStatus(' + wsId + ',' + i.id + ')" title="Næste status">🔄</button> ' +
          '<button class="action-btn" onclick="window.skDeleteInitiative(' + wsId + ',' + i.id + ')" title="Slet">🗑️</button>' +
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

  // ---------------------------------------------------------------------------
  // KANBAN VIEW
  // ---------------------------------------------------------------------------
  function renderKanbanView(container, initiatives, wsId) {
    var colsHtml = KANBAN_COLS.map(function (col) {
      var cards     = initiatives.filter(function (i) { return i.status === col.id; });
      var cardsHtml = cards.length === 0
        ? '<div class="kanban-empty">Ingen initiativer</div>'
        : cards.map(function (i) {
            var dl = i.deadline ? '<span class="impl-badge deadline-badge">📅 ' + escHtml(i.deadline) + '</span>' : '';
            return '<div class="kanban-card">' +
              '<div class="kc-title">' + escHtml(i.title) + '</div>' +
              '<div class="kc-badges">' +
                '<span class="impl-badge ' + implClass(i.impl) + '"><span class="badge-dot ' + implDotClass(i.impl) + '"></span>' + implLabel(i.impl) + '</span>' +
                '<span class="impl-badge ' + implClass(i.effect) + '"><span class="badge-dot ' + implDotClass(i.effect) + '"></span>' + implLabel(i.effect) + ' effekt</span>' +
                '<span class="impl-badge horizon-badge">⏱️ ' + horizonLabel(i.timeHorizon) + '</span>' +
                dl +
              '</div>' +
              '<div class="kc-footer">' +
                '<div class="kc-roi">ROI <div class="roi-mini-track"><div class="roi-mini-fill" style="width:' + ((i.roi || 0) * 10) + '%"></div></div><span>' + (i.roi || 0) + '</span></div>' +
                '<div class="kc-actions">' +
                  '<button class="kc-action-btn" onclick="window.skCycleInitiativeStatus(' + wsId + ',' + i.id + ')" title="Næste status">🔄</button>' +
                  '<button class="kc-action-btn" onclick="window.skDeleteInitiative(' + wsId + ',' + i.id + ')" title="Slet">🗑️</button>' +
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

  // ---------------------------------------------------------------------------
  // TIMELINE VIEW
  // ---------------------------------------------------------------------------
  function renderTimelineView(container, initiatives) {
    var sorted = initiatives.slice().sort(function (a, b) {
      if (!a.deadline && !b.deadline)
        return (HORIZON_ORDER[a.timeHorizon || 'uger'] || 0) - (HORIZON_ORDER[b.timeHorizon || 'uger'] || 0);
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline) - new Date(b.deadline);
    });

    if (sorted.length === 0) {
      container.innerHTML = '<div class="timeline-view"><div class="timeline-empty">Ingen initiativer matcher dine filtre.</div></div>';
      return;
    }

    var itemsHtml = sorted.map(function (i, idx) {
      var side   = idx % 2 === 0 ? 't-left' : 't-right';
      var period = horizonLabel(i.timeHorizon) + (i.deadline ? ' · Deadline: ' + escHtml(i.deadline) : '');
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

  // ---------------------------------------------------------------------------
  // FILTERING
  // ---------------------------------------------------------------------------
  function setFilter(filterKey, btn, dataAttr) {
    currentFilters[filterKey] = btn.dataset[dataAttr];
    var group = btn.closest('.fp-group');
    if (group) {
      group.querySelectorAll('.fp-btn').forEach(function (b) { b.classList.toggle('active', b === btn); });
    }
    var ws = getWorkspace(appState.workspaceId);
    if (!ws) return;
    renderDetailView(getSortedInitiatives(getFilteredInitiatives(ws.initiatives)), appState.workspaceId);
  }

  function getFilteredInitiatives(initiatives) {
    var f  = initiatives;
    var cf = currentFilters;
    if (cf.audience !== 'all') f = f.filter(function (i) {
      var auds = Array.isArray(i.audiences) ? i.audiences : [i.audiences];
      return auds.indexOf(cf.audience) >= 0 || auds.indexOf('all') >= 0;
    });
    if (cf.status   !== 'all') f = f.filter(function (i) { return i.status === cf.status; });
    if (cf.horizon  !== 'all') f = f.filter(function (i) { return i.timeHorizon === cf.horizon; });
    if (cf.impl     !== 'all') f = f.filter(function (i) { return i.impl === cf.impl; });
    if (cf.effect   !== 'all') f = f.filter(function (i) { return i.effect === cf.effect; });
    if (cf.deadline === 'has')  f = f.filter(function (i) { return i.deadline && i.deadline !== ''; });
    if (cf.deadline === 'none') f = f.filter(function (i) { return !i.deadline || i.deadline === ''; });
    return f;
  }

  function getSortedInitiatives(initiatives) {
    var sorted = initiatives.slice();
    switch (currentSort) {
      case 'roi':      sorted.sort(function (a, b) { return (b.roi || 0) - (a.roi || 0); }); break;
      case 'cost':     sorted.sort(function (a, b) { return (a.cost || 0) - (b.cost || 0); }); break;
      case 'horizon':  sorted.sort(function (a, b) { return (HORIZON_ORDER[a.timeHorizon] || 0) - (HORIZON_ORDER[b.timeHorizon] || 0); }); break;
      case 'deadline': sorted.sort(function (a, b) {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline) - new Date(b.deadline);
      }); break;
      default: sorted.sort(function (a, b) { return a.id - b.id; });
    }
    return sorted;
  }

  function onSortChange() {
    var sel = document.getElementById('sk-sort-select');
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

  // ---------------------------------------------------------------------------
  // WORKSPACE CRUD
  // ---------------------------------------------------------------------------
  function openNewWorkspaceModal() {
    document.getElementById('sk-wsIcon').value = '📋';
    document.getElementById('sk-wsName').value = '';
    document.getElementById('sk-wsDesc').value = '';
    document.getElementById('sk-newWorkspaceModal').style.display = 'block';
    setTimeout(function () { document.getElementById('sk-wsName').focus(); }, 50);
  }

  function closeNewWorkspaceModal() {
    document.getElementById('sk-newWorkspaceModal').style.display = 'none';
  }

  function saveNewWorkspace() {
    var name = document.getElementById('sk-wsName').value.trim();
    if (!name) { showToast('Angiv et navn for arbejdsområdet.', 'error'); return; }

    apiFetch('POST', 'workspaces', {
      name:        name,
      icon:        document.getElementById('sk-wsIcon').value.trim() || '📋',
      description: document.getElementById('sk-wsDesc').value.trim(),
    }).then(function (ws) {
      closeNewWorkspaceModal();
      return refreshData().then(function () {
        navigate('workspace', ws.id);
      });
    }).catch(function (err) {
      showToast('Kunne ikke oprette arbejdsområde: ' + err.message, 'error');
    });
  }

  // ---------------------------------------------------------------------------
  // INITIATIVE CRUD
  // ---------------------------------------------------------------------------
  function openNewInitiativeModal(wsId) {
    newInitiativeWsId = wsId;
    document.getElementById('sk-initTitle').value       = '';
    document.getElementById('sk-initStatus').value      = 'ide';
    document.getElementById('sk-initShortDesc').value   = '';
    document.getElementById('sk-initDetails').value     = '';
    document.getElementById('sk-initImpact').value      = '';
    document.getElementById('sk-initROI').value         = '7';
    document.getElementById('sk-initCost').value        = '';
    document.getElementById('sk-initDeadline').value    = '';
    document.getElementById('sk-initTimeHorizon').value = '1';
    document.getElementById('sk-initTimeHorizonLabel').textContent = 'Uger';
    document.getElementById('sk-initImpl').value        = 'lav';
    document.getElementById('sk-initEffect').value      = 'lav';
    document.querySelectorAll('#sk-initImplCircles .skeleton-circ-btn').forEach(function (b, i) { b.classList.toggle('selected', i === 0); });
    document.querySelectorAll('#sk-initEffectCircles .skeleton-circ-btn').forEach(function (b, i) { b.classList.toggle('selected', i === 0); });
    document.querySelectorAll('#sk-newInitiativeModal .skeleton-form-checkbox input').forEach(function (cb) { cb.checked = false; });
    document.getElementById('sk-newInitiativeModal').style.display = 'block';
    setTimeout(function () { document.getElementById('sk-initTitle').focus(); }, 50);
  }

  function closeNewInitiativeModal() {
    document.getElementById('sk-newInitiativeModal').style.display = 'none';
    newInitiativeWsId = null;
  }

  function saveNewInitiative() {
    var title = document.getElementById('sk-initTitle').value.trim();
    if (!title) { showToast('Tilføj en titel!', 'error'); return; }

    var audiences = [];
    if (document.getElementById('sk-initAudSponsor').checked)   audiences.push('sponsor');
    if (document.getElementById('sk-initAudFan').checked)       audiences.push('fan');
    if (document.getElementById('sk-initAudFrivillig').checked) audiences.push('frivillig');

    var horizonIdx = parseInt(document.getElementById('sk-initTimeHorizon').value, 10);

    apiFetch('POST', 'workspaces/' + newInitiativeWsId + '/initiatives', {
      title:       title,
      status:      document.getElementById('sk-initStatus').value,
      shortDesc:   document.getElementById('sk-initShortDesc').value.trim(),
      details:     document.getElementById('sk-initDetails').value.trim(),
      impact:      document.getElementById('sk-initImpact').value.trim(),
      roi:         Math.min(10, Math.max(0, parseInt(document.getElementById('sk-initROI').value, 10) || 0)),
      cost:        parseInt(document.getElementById('sk-initCost').value, 10) || 0,
      impl:        document.getElementById('sk-initImpl').value,
      effect:      document.getElementById('sk-initEffect').value,
      deadline:    document.getElementById('sk-initDeadline').value,
      timeHorizon: HORIZON_VALUES[horizonIdx],
      audiences:   audiences.length > 0 ? audiences.join(',') : 'all',
    }).then(function () {
      closeNewInitiativeModal();
      return refreshData();
    }).catch(function (err) {
      showToast('Kunne ikke oprette initiativ: ' + err.message, 'error');
    });
  }

  function cycleInitiativeStatus(wsId, initId) {
    var ws   = getWorkspace(wsId);
    if (!ws) return;
    var init = ws.initiatives.filter(function (i) { return i.id === initId; })[0];
    if (!init) return;
    var order   = ['ide', 'planlagt', 'igang', 'afsluttet'];
    var nextStatus = order[(order.indexOf(init.status) + 1) % order.length];

    apiFetch('PATCH', 'workspaces/' + wsId + '/initiatives/' + initId, { status: nextStatus })
      .then(function () { return refreshData(); })
      .catch(function (err) { showToast('Kunne ikke opdatere status: ' + err.message, 'error'); });
  }

  function deleteInitiative(wsId, initId) {
    if (!confirm('Er du sikker på, at du vil slette dette initiativ?')) return;
    apiFetch('DELETE', 'workspaces/' + wsId + '/initiatives/' + initId)
      .then(function () { return refreshData(); })
      .catch(function (err) { showToast('Kunne ikke slette initiativ: ' + err.message, 'error'); });
  }

  // ---------------------------------------------------------------------------
  // FORM CONTROLS SETUP
  // ---------------------------------------------------------------------------
  function setupFormControls() {
    [['#sk-initImplCircles', 'sk-initImpl'], ['#sk-initEffectCircles', 'sk-initEffect']].forEach(function (pair) {
      var sel      = pair[0];
      var hiddenId = pair[1];
      document.querySelectorAll(sel + ' .skeleton-circ-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          document.querySelectorAll(sel + ' .skeleton-circ-btn').forEach(function (b) { b.classList.remove('selected'); });
          this.classList.add('selected');
          document.getElementById(hiddenId).value = this.dataset.val;
        });
      });
    });

    var slider = document.getElementById('sk-initTimeHorizon');
    var label  = document.getElementById('sk-initTimeHorizonLabel');
    if (slider) {
      slider.addEventListener('input', function () { label.textContent = HORIZON_LABELS[this.value]; });
    }

    // Close modals on outside click
    window.addEventListener('click', function (e) {
      ['sk-newWorkspaceModal', 'sk-newInitiativeModal'].forEach(function (id) {
        var m = document.getElementById(id);
        if (m && e.target === m) m.style.display = 'none';
      });
    });
  }

  // ---------------------------------------------------------------------------
  // INIT
  // ---------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', function () {
    setupFormControls();
    refreshData();
    // Poll for updates every 30 seconds
    setInterval(function () {
      refreshData().catch(function () { /* silently handled inside refreshData */ });
    }, 30000);
  });

  // ---------------------------------------------------------------------------
  // WINDOW EXPORTS  (required for inline onclick= handlers in WordPress context)
  // ---------------------------------------------------------------------------
  window.skNavigate              = navigate;
  window.skStartTimer            = startTimer;
  window.skStopTimer             = stopTimer;
  window.skOpenNewWorkspaceModal  = openNewWorkspaceModal;
  window.skCloseNewWorkspaceModal = closeNewWorkspaceModal;
  window.skSaveNewWorkspace       = saveNewWorkspace;
  window.skOpenNewInitiativeModal  = openNewInitiativeModal;
  window.skCloseNewInitiativeModal = closeNewInitiativeModal;
  window.skSaveNewInitiative       = saveNewInitiative;
  window.skSwitchDetailView        = switchDetailView;
  window.skSetFilter               = setFilter;
  window.skResetFilters            = resetFilters;
  window.skOnSortChange            = onSortChange;
  window.skCycleInitiativeStatus   = cycleInitiativeStatus;
  window.skDeleteInitiative        = deleteInitiative;
  window.skShowToast               = showToast;

}());
