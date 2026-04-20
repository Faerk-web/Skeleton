<?php
/**
 * Plugin Name: Skeleton Team App
 * Plugin URI:  https://github.com/Faerk-web/Skeleton
 * Description: Initiativstyring for frivillige organisationer – kanban, liste og tidslinje.
 * Version:     1.2.0
 * Author:      Faerk-web
 * License:     GPL-2.0+
 * Text Domain: skeleton-team-app
 */

defined('ABSPATH') || exit;

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

// Set define('SKELETON_APP_SEED_DEMO', true) in wp-config.php to seed demo
// data on the FIRST plugin activation. Default: false – no demo data.
if (!defined('SKELETON_APP_SEED_DEMO')) {
    define('SKELETON_APP_SEED_DEMO', false);
}

define('SKELETON_VERSION', '1.2.0');
define('SKELETON_PLUGIN_FILE', __FILE__);
define('SKELETON_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('SKELETON_PLUGIN_URL', plugin_dir_url(__FILE__));
define('SKELETON_REST_NS', 'skeleton/v1');

// ---------------------------------------------------------------------------
// ACTIVATION / DEACTIVATION
// ---------------------------------------------------------------------------

register_activation_hook(__FILE__, 'skeleton_activate');
register_deactivation_hook(__FILE__, 'skeleton_deactivate');

function skeleton_activate() {
    skeleton_create_tables();

    // Seed demo data only when explicitly opted in AND not already seeded.
    if (SKELETON_APP_SEED_DEMO && !get_option('skeleton_demo_seeded')) {
        skeleton_seed_demo_data();
        update_option('skeleton_demo_seeded', 1);
    }

    flush_rewrite_rules();
}

function skeleton_deactivate() {
    flush_rewrite_rules();
}

// ---------------------------------------------------------------------------
// DATABASE TABLES
// ---------------------------------------------------------------------------

function skeleton_create_tables() {
    global $wpdb;
    $charset = $wpdb->get_charset_collate();

    $workspaces_table = $wpdb->prefix . 'skeleton_workspaces';
    $initiatives_table = $wpdb->prefix . 'skeleton_initiatives';

    $sql = "
CREATE TABLE IF NOT EXISTS {$workspaces_table} (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name        VARCHAR(255)    NOT NULL,
    icon        VARCHAR(16)     NOT NULL DEFAULT '📋',
    description TEXT,
    created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) {$charset};

CREATE TABLE IF NOT EXISTS {$initiatives_table} (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    workspace_id BIGINT UNSIGNED NOT NULL,
    title        VARCHAR(255)    NOT NULL,
    status       VARCHAR(50)     NOT NULL DEFAULT 'ide',
    short_desc   TEXT,
    details      TEXT,
    impact       TEXT,
    roi          TINYINT UNSIGNED NOT NULL DEFAULT 5,
    cost         INT UNSIGNED     NOT NULL DEFAULT 0,
    impl         VARCHAR(20)      NOT NULL DEFAULT 'lav',
    effect       VARCHAR(20)      NOT NULL DEFAULT 'lav',
    deadline     DATE,
    time_horizon VARCHAR(20)      NOT NULL DEFAULT 'uger',
    audiences    VARCHAR(255)     NOT NULL DEFAULT 'all',
    created_at   DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY workspace_id (workspace_id)
) {$charset};
";

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta($sql);
    update_option('skeleton_db_version', SKELETON_VERSION);
}

// ---------------------------------------------------------------------------
// DEMO SEED (opt-in only – never runs by default)
// ---------------------------------------------------------------------------

function skeleton_seed_demo_data() {
    global $wpdb;
    $workspaces_table  = $wpdb->prefix . 'skeleton_workspaces';
    $initiatives_table = $wpdb->prefix . 'skeleton_initiatives';

    $ws_id = $wpdb->insert(
        $workspaces_table,
        ['name' => 'Demo Arbejdsområde', 'icon' => '🚀', 'description' => 'Eksempel-arbejdsområde (demo)'],
        ['%s', '%s', '%s']
    );
    if (!$ws_id) {
        return;
    }
    $ws_id = $wpdb->insert_id;

    $initiatives = [
        ['title' => 'Demo Initiativ A', 'status' => 'ide',      'short_desc' => 'Et demo-initiativ', 'roi' => 7, 'cost' => 5000,  'impl' => 'lav',    'effect' => 'høj',   'time_horizon' => 'uger',   'audiences' => 'sponsor'],
        ['title' => 'Demo Initiativ B', 'status' => 'igang',    'short_desc' => 'Et demo-initiativ', 'roi' => 5, 'cost' => 15000, 'impl' => 'middel', 'effect' => 'middel','time_horizon' => 'måneder','audiences' => 'frivillig'],
        ['title' => 'Demo Initiativ C', 'status' => 'afsluttet','short_desc' => 'Et demo-initiativ', 'roi' => 8, 'cost' => 8000,  'impl' => 'lav',    'effect' => 'høj',   'time_horizon' => 'dage',   'audiences' => 'fan'],
    ];

    foreach ($initiatives as $init) {
        $wpdb->insert(
            $initiatives_table,
            array_merge(['workspace_id' => $ws_id], $init),
            ['%d', '%s', '%s', '%s', '%d', '%d', '%s', '%s', '%s', '%s']
        );
    }
}

// ---------------------------------------------------------------------------
// SHORTCODE  [skeleton_app]
// ---------------------------------------------------------------------------

add_shortcode('skeleton_app', 'skeleton_render_app');

function skeleton_render_app() {
    ob_start();
    ?>
    <div id="skeleton-app">
      <div class="app-layout">

        <!-- SIDEBAR -->
        <aside class="sidebar">
          <div class="sidebar-logo">
            <div class="sidebar-logo-icon">S</div>
            <div>
              <div class="sidebar-logo-text">Skeleton</div>
              <div class="sidebar-logo-sub">Initiativstyring</div>
            </div>
          </div>
          <nav class="sidebar-nav">
            <div class="nav-section-label">Menu</div>
            <div class="nav-item active" id="sk-nav-dashboard" onclick="window.skNavigate('dashboard')">
              <span class="nav-icon">📊</span>
              <span>Dashboard</span>
            </div>
            <div class="nav-item" id="sk-nav-workspaces" onclick="window.skNavigate('workspaces')">
              <span class="nav-icon">📁</span>
              <span class="nav-ws-label">Arbejdsområder</span>
              <span class="nav-ws-add-btn" onclick="event.stopPropagation();window.skOpenNewWorkspaceModal();" title="Nyt arbejdsområde">+</span>
            </div>
            <div id="sk-sidebar-ws-list"></div>
            <button class="sidebar-add-btn" onclick="window.skOpenNewWorkspaceModal()">
              <span>+</span>
              <span>Nyt arbejdsområde</span>
            </button>
          </nav>
          <div class="sidebar-download-card">
            <div class="sdc-emoji">📁</div>
            <div class="sdc-title">Skeleton</div>
            <div class="sdc-sub">Initiativstyring</div>
          </div>
        </aside>

        <!-- MAIN WRAPPER -->
        <div class="main-wrapper">
          <header class="global-header">
            <div class="gh-search">
              <span class="gh-search-icon">🔍</span>
              <input class="gh-search-input" type="text" placeholder="Søg…">
            </div>
            <div class="gh-right">
              <?php if (is_user_logged_in()):
                $user = wp_get_current_user();
                $initials = strtoupper(substr($user->display_name, 0, 1) . substr(strrchr($user->display_name, ' '), 1, 1));
              ?>
              <div class="gh-user">
                <div class="gh-avatar"><?php echo esc_html($initials ?: '?'); ?></div>
                <div class="gh-user-info">
                  <div class="gh-user-name"><?php echo esc_html($user->display_name); ?></div>
                  <div class="gh-user-email"><?php echo esc_html($user->user_email); ?></div>
                </div>
              </div>
              <?php endif; ?>
            </div>
          </header>
          <div class="main-content" id="sk-main-content">
            <!-- Rendered by app.js -->
          </div>
        </div>

      </div><!-- .app-layout -->
    </div><!-- #skeleton-app -->

    <!-- MODAL: Nyt arbejdsområde -->
    <div id="sk-newWorkspaceModal" class="skeleton-modal">
      <div class="skeleton-modal-content modal-sm">
        <div class="skeleton-modal-header">
          <h2>Nyt arbejdsområde</h2>
          <button class="skeleton-close-btn" onclick="window.skCloseNewWorkspaceModal()">&#x00D7;</button>
        </div>
        <div class="skeleton-form-grid">
          <div class="skeleton-form-field full">
            <label class="skeleton-form-label">Ikon (emoji)</label>
            <input class="skeleton-form-input" id="sk-wsIcon" type="text" maxlength="4" value="📋" placeholder="📋">
          </div>
          <div class="skeleton-form-field full">
            <label class="skeleton-form-label">Navn</label>
            <input class="skeleton-form-input" id="sk-wsName" type="text" placeholder="Fx Sponsortiltrækning">
          </div>
          <div class="skeleton-form-field full">
            <label class="skeleton-form-label">Beskrivelse</label>
            <textarea class="skeleton-form-textarea" id="sk-wsDesc" placeholder="Hvad handler dette arbejdsområde om?"></textarea>
          </div>
        </div>
        <div class="skeleton-modal-actions">
          <button class="skeleton-btn-cancel" onclick="window.skCloseNewWorkspaceModal()">Annuller</button>
          <button class="skeleton-btn-save" onclick="window.skSaveNewWorkspace()">Opret</button>
        </div>
      </div>
    </div>

    <!-- MODAL: Nyt initiativ -->
    <div id="sk-newInitiativeModal" class="skeleton-modal">
      <div class="skeleton-modal-content">
        <div class="skeleton-modal-header">
          <h2>Nyt initiativ</h2>
          <button class="skeleton-close-btn" onclick="window.skCloseNewInitiativeModal()">&#x00D7;</button>
        </div>
        <div class="skeleton-form-grid">
          <div class="skeleton-form-field full">
            <label class="skeleton-form-label">Titel</label>
            <input class="skeleton-form-input" id="sk-initTitle" type="text" placeholder="Eksempel: Stat-bar med live resultater">
          </div>
          <div class="skeleton-form-field full">
            <label class="skeleton-form-label">Status</label>
            <select class="skeleton-form-select" id="sk-initStatus">
              <option value="ide">Idé</option>
              <option value="planlagt">Planlagt</option>
              <option value="igang">Igang</option>
              <option value="afsluttet">Afsluttet</option>
            </select>
          </div>
          <div class="skeleton-form-field full">
            <label class="skeleton-form-label">Målgruppe</label>
            <div class="skeleton-form-checkboxes">
              <div class="skeleton-form-checkbox">
                <input type="checkbox" id="sk-initAudSponsor" value="sponsor">
                <label for="sk-initAudSponsor">Sponsor</label>
              </div>
              <div class="skeleton-form-checkbox">
                <input type="checkbox" id="sk-initAudFan" value="fan">
                <label for="sk-initAudFan">Fan</label>
              </div>
              <div class="skeleton-form-checkbox">
                <input type="checkbox" id="sk-initAudFrivillig" value="frivillig">
                <label for="sk-initAudFrivillig">Frivillig</label>
              </div>
            </div>
          </div>
          <div class="skeleton-form-field full">
            <label class="skeleton-form-label">Kort beskrivelse</label>
            <input class="skeleton-form-input" id="sk-initShortDesc" type="text" placeholder="En linje beskrivelse">
          </div>
          <div class="skeleton-form-field full">
            <label class="skeleton-form-label">Detaljer</label>
            <textarea class="skeleton-form-textarea" id="sk-initDetails" placeholder="Fuldstændig beskrivelse..."></textarea>
          </div>
          <div class="skeleton-form-field">
            <label class="skeleton-form-label">Påvirkning</label>
            <input class="skeleton-form-input" id="sk-initImpact" type="text" placeholder="Eksempel: Højere engagement">
          </div>
          <div class="skeleton-form-field">
            <label class="skeleton-form-label">ROI (0–10)</label>
            <input class="skeleton-form-input" id="sk-initROI" type="number" min="0" max="10" value="7" placeholder="7">
          </div>
          <div class="skeleton-form-field">
            <label class="skeleton-form-label">Estimeret pris (DKK)</label>
            <input class="skeleton-form-input" id="sk-initCost" type="number" min="0" placeholder="5000">
          </div>
          <div class="skeleton-form-field">
            <label class="skeleton-form-label">Deadline</label>
            <input class="skeleton-form-input" id="sk-initDeadline" type="date">
          </div>
          <div class="skeleton-form-field full">
            <label class="skeleton-form-label">Tidshorisont</label>
            <div class="skeleton-slider-wrap">
              <input type="range" class="skeleton-horizon-slider" id="sk-initTimeHorizon" min="0" max="3" step="1" value="1">
              <span class="skeleton-horizon-label" id="sk-initTimeHorizonLabel">Uger</span>
            </div>
            <div class="skeleton-slider-ticks">
              <span>Dage</span><span>Uger</span><span>Måneder</span><span>År</span>
            </div>
          </div>
          <div class="skeleton-form-field">
            <label class="skeleton-form-label">Vanskelighed</label>
            <div class="skeleton-circle-selector" id="sk-initImplCircles">
              <button type="button" class="skeleton-circ-btn green selected" data-val="lav"><span class="dot"></span>Lav</button>
              <button type="button" class="skeleton-circ-btn yellow" data-val="middel"><span class="dot"></span>Middel</button>
              <button type="button" class="skeleton-circ-btn red" data-val="høj"><span class="dot"></span>Høj</button>
            </div>
            <input type="hidden" id="sk-initImpl" value="lav">
          </div>
          <div class="skeleton-form-field">
            <label class="skeleton-form-label">Estimeret effekt</label>
            <div class="skeleton-circle-selector" id="sk-initEffectCircles">
              <button type="button" class="skeleton-circ-btn green selected" data-val="lav"><span class="dot"></span>Lav</button>
              <button type="button" class="skeleton-circ-btn yellow" data-val="middel"><span class="dot"></span>Middel</button>
              <button type="button" class="skeleton-circ-btn red" data-val="høj"><span class="dot"></span>Høj</button>
            </div>
            <input type="hidden" id="sk-initEffect" value="lav">
          </div>
        </div>
        <div class="skeleton-modal-actions">
          <button class="skeleton-btn-cancel" onclick="window.skCloseNewInitiativeModal()">Annuller</button>
          <button class="skeleton-btn-save" onclick="window.skSaveNewInitiative()">Gem initiativ</button>
        </div>
      </div>
    </div>
    <?php
    return ob_get_clean();
}

// ---------------------------------------------------------------------------
// ENQUEUE SCRIPTS & STYLES
// ---------------------------------------------------------------------------

add_action('wp_enqueue_scripts', 'skeleton_enqueue');

function skeleton_enqueue() {
    // Only load on pages/posts that use the shortcode.
    global $post;
    if (is_a($post, 'WP_Post') && !has_shortcode($post->post_content, 'skeleton_app')) {
        return;
    }

    wp_enqueue_style(
        'skeleton-app',
        SKELETON_PLUGIN_URL . 'assets/styles.css',
        [],
        SKELETON_VERSION
    );

    wp_enqueue_script(
        'skeleton-app',
        SKELETON_PLUGIN_URL . 'assets/app.js',
        [],
        SKELETON_VERSION,
        true  // load in footer
    );

    // Pass REST root + nonce to JS.
    wp_localize_script('skeleton-app', 'skeletonConfig', [
        'restUrl'  => esc_url_raw(rest_url(SKELETON_REST_NS . '/')),
        'nonce'    => wp_create_nonce('wp_rest'),
        'demoMode' => SKELETON_APP_SEED_DEMO ? '1' : '0',
    ]);
}

// ---------------------------------------------------------------------------
// REST API
// ---------------------------------------------------------------------------

add_action('rest_api_init', 'skeleton_register_routes');

function skeleton_register_routes() {
    // Workspaces
    register_rest_route(SKELETON_REST_NS, '/workspaces', [
        ['methods' => 'GET',  'callback' => 'skeleton_get_workspaces',  'permission_callback' => 'skeleton_read_permission'],
        ['methods' => 'POST', 'callback' => 'skeleton_create_workspace','permission_callback' => 'skeleton_write_permission'],
    ]);
    register_rest_route(SKELETON_REST_NS, '/workspaces/(?P<id>\d+)', [
        ['methods' => 'DELETE', 'callback' => 'skeleton_delete_workspace', 'permission_callback' => 'skeleton_write_permission'],
    ]);

    // Initiatives
    register_rest_route(SKELETON_REST_NS, '/workspaces/(?P<ws_id>\d+)/initiatives', [
        ['methods' => 'GET',  'callback' => 'skeleton_get_initiatives',  'permission_callback' => 'skeleton_read_permission'],
        ['methods' => 'POST', 'callback' => 'skeleton_create_initiative','permission_callback' => 'skeleton_write_permission'],
    ]);
    register_rest_route(SKELETON_REST_NS, '/workspaces/(?P<ws_id>\d+)/initiatives/(?P<id>\d+)', [
        ['methods' => 'PATCH',  'callback' => 'skeleton_update_initiative','permission_callback' => 'skeleton_write_permission'],
        ['methods' => 'DELETE', 'callback' => 'skeleton_delete_initiative','permission_callback' => 'skeleton_write_permission'],
    ]);

    // Admin-only reset
    register_rest_route(SKELETON_REST_NS, '/admin/reset', [
        'methods'             => 'POST',
        'callback'            => 'skeleton_admin_reset',
        'permission_callback' => 'skeleton_admin_permission',
    ]);
}

// Permission callbacks --------------------------------------------------

function skeleton_read_permission() {
    return is_user_logged_in();
}

function skeleton_write_permission() {
    return is_user_logged_in();
}

function skeleton_admin_permission() {
    return current_user_can('manage_options');
}

// Workspace endpoints ---------------------------------------------------

function skeleton_get_workspaces() {
    global $wpdb;
    $table = $wpdb->prefix . 'skeleton_workspaces';
    $rows  = $wpdb->get_results("SELECT * FROM {$table} ORDER BY id ASC");
    return rest_ensure_response(array_map('skeleton_format_workspace', $rows));
}

function skeleton_create_workspace(WP_REST_Request $req) {
    global $wpdb;
    $table = $wpdb->prefix . 'skeleton_workspaces';

    $name = sanitize_text_field($req->get_param('name'));
    if (!$name) {
        return new WP_Error('missing_name', 'Navn er påkrævet.', ['status' => 400]);
    }

    $wpdb->insert(
        $table,
        [
            'name'        => $name,
            'icon'        => sanitize_text_field($req->get_param('icon') ?: '📋'),
            'description' => sanitize_textarea_field($req->get_param('description') ?: ''),
        ],
        ['%s', '%s', '%s']
    );

    $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE id = %d", $wpdb->insert_id));
    return rest_ensure_response(skeleton_format_workspace($row));
}

function skeleton_delete_workspace(WP_REST_Request $req) {
    global $wpdb;
    $ws_table  = $wpdb->prefix . 'skeleton_workspaces';
    $init_table = $wpdb->prefix . 'skeleton_initiatives';
    $id        = (int) $req->get_param('id');

    $wpdb->delete($init_table, ['workspace_id' => $id], ['%d']);
    $wpdb->delete($ws_table,   ['id' => $id],           ['%d']);

    return rest_ensure_response(['deleted' => true, 'id' => $id]);
}

function skeleton_format_workspace($row) {
    return [
        'id'          => (int) $row->id,
        'name'        => $row->name,
        'icon'        => $row->icon,
        'description' => $row->description,
        'createdAt'   => $row->created_at,
        'updatedAt'   => $row->updated_at,
    ];
}

// Initiative endpoints --------------------------------------------------

function skeleton_get_initiatives(WP_REST_Request $req) {
    global $wpdb;
    $table  = $wpdb->prefix . 'skeleton_initiatives';
    $ws_id  = (int) $req->get_param('ws_id');
    $rows   = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$table} WHERE workspace_id = %d ORDER BY id ASC", $ws_id));
    return rest_ensure_response(array_map('skeleton_format_initiative', $rows));
}

function skeleton_create_initiative(WP_REST_Request $req) {
    global $wpdb;
    $table = $wpdb->prefix . 'skeleton_initiatives';
    $ws_id = (int) $req->get_param('ws_id');

    $title = sanitize_text_field($req->get_param('title'));
    if (!$title) {
        return new WP_Error('missing_title', 'Titel er påkrævet.', ['status' => 400]);
    }

    $deadline = $req->get_param('deadline');
    $deadline_val = ($deadline && preg_match('/^\d{4}-\d{2}-\d{2}$/', $deadline)) ? $deadline : null;

    $wpdb->insert(
        $table,
        [
            'workspace_id' => $ws_id,
            'title'        => $title,
            'status'       => sanitize_key($req->get_param('status') ?: 'ide'),
            'short_desc'   => sanitize_textarea_field($req->get_param('shortDesc') ?: ''),
            'details'      => sanitize_textarea_field($req->get_param('details') ?: ''),
            'impact'       => sanitize_textarea_field($req->get_param('impact') ?: ''),
            'roi'          => min(10, max(0, (int) $req->get_param('roi'))),
            'cost'         => max(0, (int) $req->get_param('cost')),
            'impl'         => sanitize_key($req->get_param('impl') ?: 'lav'),
            'effect'       => sanitize_key($req->get_param('effect') ?: 'lav'),
            'deadline'     => $deadline_val,
            'time_horizon' => sanitize_key($req->get_param('timeHorizon') ?: 'uger'),
            'audiences'    => sanitize_text_field($req->get_param('audiences') ?: 'all'),
        ],
        ['%d', '%s', '%s', '%s', '%s', '%s', '%d', '%d', '%s', '%s', '%s', '%s', '%s']
    );

    $row = $wpdb->get_row($wpdb->prepare(
        "SELECT * FROM {$table} WHERE id = %d", $wpdb->insert_id
    ));
    return rest_ensure_response(skeleton_format_initiative($row));
}

function skeleton_update_initiative(WP_REST_Request $req) {
    global $wpdb;
    $table = $wpdb->prefix . 'skeleton_initiatives';
    $id    = (int) $req->get_param('id');
    $ws_id = (int) $req->get_param('ws_id');

    $allowed = ['title', 'status', 'short_desc', 'details', 'impact', 'roi', 'cost', 'impl', 'effect', 'deadline', 'time_horizon', 'audiences'];
    $data    = [];
    $formats = [];

    $map = [
        'title'       => ['%s', 'sanitize_text_field'],
        'status'      => ['%s', 'sanitize_key'],
        'shortDesc'   => ['%s', 'sanitize_textarea_field', 'short_desc'],
        'details'     => ['%s', 'sanitize_textarea_field'],
        'impact'      => ['%s', 'sanitize_textarea_field'],
        'roi'         => ['%d', null],
        'cost'        => ['%d', null],
        'impl'        => ['%s', 'sanitize_key'],
        'effect'      => ['%s', 'sanitize_key'],
        'deadline'    => ['%s', null],
        'timeHorizon' => ['%s', 'sanitize_key', 'time_horizon'],
        'audiences'   => ['%s', 'sanitize_text_field'],
    ];

    foreach ($map as $param => $cfg) {
        $val = $req->get_param($param);
        if ($val === null) {
            continue;
        }
        $col = isset($cfg[2]) ? $cfg[2] : $param;
        if (in_array($col, $allowed, true)) {
            $sanitizer = $cfg[1];
            $data[$col] = $sanitizer ? $sanitizer($val) : $val;
            $formats[]  = $cfg[0];
        }
    }

    if (empty($data)) {
        return new WP_Error('no_fields', 'Ingen felter at opdatere.', ['status' => 400]);
    }

    $wpdb->update($table, $data, ['id' => $id, 'workspace_id' => $ws_id], $formats, ['%d', '%d']);

    $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE id = %d", $id));
    return rest_ensure_response(skeleton_format_initiative($row));
}

function skeleton_delete_initiative(WP_REST_Request $req) {
    global $wpdb;
    $table = $wpdb->prefix . 'skeleton_initiatives';
    $id    = (int) $req->get_param('id');
    $ws_id = (int) $req->get_param('ws_id');
    $wpdb->delete($table, ['id' => $id, 'workspace_id' => $ws_id], ['%d', '%d']);
    return rest_ensure_response(['deleted' => true, 'id' => $id]);
}

function skeleton_format_initiative($row) {
    return [
        'id'          => (int) $row->id,
        'workspaceId' => (int) $row->workspace_id,
        'title'       => $row->title,
        'status'      => $row->status,
        'shortDesc'   => $row->short_desc,
        'details'     => $row->details,
        'impact'      => $row->impact,
        'roi'         => (int) $row->roi,
        'cost'        => (int) $row->cost,
        'impl'        => $row->impl,
        'effect'      => $row->effect,
        'deadline'    => $row->deadline,
        'timeHorizon' => $row->time_horizon,
        'audiences'   => $row->audiences ? explode(',', $row->audiences) : ['all'],
        'createdAt'   => $row->created_at,
        'updatedAt'   => $row->updated_at,
    ];
}

// Admin reset -----------------------------------------------------------

function skeleton_admin_reset(WP_REST_Request $req) {
    if ($req->get_param('confirm') !== 'DELETE_ALL') {
        return new WP_Error(
            'confirm_required',
            'Send confirm=DELETE_ALL for at bekræfte nulstilling.',
            ['status' => 400]
        );
    }

    global $wpdb;
    $wpdb->query('TRUNCATE TABLE ' . $wpdb->prefix . 'skeleton_initiatives');
    $wpdb->query('TRUNCATE TABLE ' . $wpdb->prefix . 'skeleton_workspaces');
    delete_option('skeleton_demo_seeded');

    return rest_ensure_response(['reset' => true, 'message' => 'Alle data er slettet.']);
}

// ---------------------------------------------------------------------------
// ADMIN PAGE (Settings > Skeleton)
// ---------------------------------------------------------------------------

add_action('admin_menu', 'skeleton_admin_menu');

function skeleton_admin_menu() {
    add_options_page(
        'Skeleton Team App',
        'Skeleton',
        'manage_options',
        'skeleton-team-app',
        'skeleton_admin_page'
    );
}

function skeleton_admin_page() {
    if (!current_user_can('manage_options')) {
        wp_die(__('Ingen adgang.', 'skeleton-team-app'));
    }

    $reset_done = false;
    $reset_error = '';

    if (isset($_POST['skeleton_reset']) && check_admin_referer('skeleton_reset_nonce')) {
        global $wpdb;
        $wpdb->query('TRUNCATE TABLE ' . $wpdb->prefix . 'skeleton_initiatives');
        $wpdb->query('TRUNCATE TABLE ' . $wpdb->prefix . 'skeleton_workspaces');
        delete_option('skeleton_demo_seeded');
        $reset_done = true;
    }
    ?>
    <div class="wrap">
        <h1>Skeleton Team App</h1>

        <?php if ($reset_done): ?>
            <div class="notice notice-success"><p>✅ Alle data er nulstillet.</p></div>
        <?php endif; ?>

        <h2>Databaseoplysninger</h2>
        <?php
        global $wpdb;
        $ws_count   = (int) $wpdb->get_var('SELECT COUNT(*) FROM ' . $wpdb->prefix . 'skeleton_workspaces');
        $init_count = (int) $wpdb->get_var('SELECT COUNT(*) FROM ' . $wpdb->prefix . 'skeleton_initiatives');
        ?>
        <p>Arbejdsområder: <strong><?php echo $ws_count; ?></strong></p>
        <p>Initiativer: <strong><?php echo $init_count; ?></strong></p>

        <h2 style="color:#b91c1c;margin-top:2rem;">⚠️ Nulstil alle data (staging)</h2>
        <p>Denne handling <strong>sletter</strong> alle arbejdsområder og initiativer permanent. Brug kun på staging/test-miljøer.</p>
        <form method="post" onsubmit="return confirm('Er du HELT sikker? Alle data slettes permanent!');">
            <?php wp_nonce_field('skeleton_reset_nonce'); ?>
            <input type="submit" name="skeleton_reset" class="button button-secondary"
                   value="Slet alle data (reset)"
                   style="background:#b91c1c;color:white;border-color:#991b1b;">
        </form>

        <h2 style="margin-top:2rem;">Shortcode</h2>
        <p>Indsæt <code>[skeleton_app]</code> på den side, der skal vise appen.</p>

        <h2>Demo-data</h2>
        <p>
            For at oprette demo-data ved aktivering, tilføj dette til <code>wp-config.php</code>:<br>
            <code>define('SKELETON_APP_SEED_DEMO', true);</code><br>
            Derefter deaktiver og reaktiver pluginnet.
        </p>
    </div>
    <?php
}
