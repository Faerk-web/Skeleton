<?php
/**
 * Plugin Name: Skeleton Team App
 * Plugin URI:  https://github.com/Faerk-web/Skeleton
 * Description: Initiativstyring SPA til frivillige – WordPress-backend med REST API, shortcode og rollestyring.
 * Version:     1.0.0
 * Author:      Skeleton
 * License:     GPL-2.0-or-later
 * Text Domain: skeleton-team-app
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'SKELETON_APP_VERSION', '1.0.0' );
define( 'SKELETON_APP_DIR', plugin_dir_path( __FILE__ ) );
define( 'SKELETON_APP_URL', plugin_dir_url( __FILE__ ) );

// -------------------------------------------------------------------------
// ACTIVATION / DB TABLES
// -------------------------------------------------------------------------

register_activation_hook( __FILE__, 'skeleton_app_activate' );

function skeleton_app_activate() {
	skeleton_app_create_tables();
	skeleton_app_add_volunteer_role();
	skeleton_app_seed_data();
}

function skeleton_app_create_tables() {
	global $wpdb;
	$charset = $wpdb->get_charset_collate();

	$workspaces_table = $wpdb->prefix . 'skeleton_workspaces';
	$initiatives_table = $wpdb->prefix . 'skeleton_initiatives';

	$sql = "
		CREATE TABLE IF NOT EXISTS {$workspaces_table} (
			id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			icon       VARCHAR(16)  NOT NULL DEFAULT '📋',
			name       VARCHAR(255) NOT NULL,
			description TEXT,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			PRIMARY KEY (id)
		) {$charset};

		CREATE TABLE IF NOT EXISTS {$initiatives_table} (
			id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			workspace_id   BIGINT UNSIGNED NOT NULL,
			title          VARCHAR(255) NOT NULL,
			status         VARCHAR(32)  NOT NULL DEFAULT 'ide',
			short_desc     TEXT,
			details        TEXT,
			impact         TEXT,
			roi            TINYINT UNSIGNED NOT NULL DEFAULT 0,
			cost           INT UNSIGNED NOT NULL DEFAULT 0,
			impl           VARCHAR(16)  NOT NULL DEFAULT 'lav',
			effect         VARCHAR(16)  NOT NULL DEFAULT 'lav',
			deadline       DATE,
			time_horizon   VARCHAR(16)  NOT NULL DEFAULT 'uger',
			audiences_json TEXT,
			created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			PRIMARY KEY (id),
			KEY workspace_id (workspace_id)
		) {$charset};
	";

	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	dbDelta( $sql );

	update_option( 'skeleton_app_db_version', SKELETON_APP_VERSION );
}

// -------------------------------------------------------------------------
// VOLUNTEER ROLE + WP-ADMIN BLOCK
// -------------------------------------------------------------------------

function skeleton_app_add_volunteer_role() {
	if ( ! get_role( 'volunteer' ) ) {
		add_role(
			'volunteer',
			__( 'Frivillig', 'skeleton-team-app' ),
			array(
				'read'                  => true,
				'skeleton_view_app'     => true,
				'skeleton_manage_data'  => true,
			)
		);
	}
	// Grant the same capability to editors and admins so they can also use the REST endpoints.
	foreach ( array( 'editor', 'administrator' ) as $role_name ) {
		$role = get_role( $role_name );
		if ( $role ) {
			$role->add_cap( 'skeleton_manage_data' );
		}
	}
}

/**
 * Block wp-admin access for non-admin / non-editor users.
 * Redirect them to /team/ (or the page tagged with [skeleton_app]).
 */
add_action( 'admin_init', 'skeleton_app_block_admin' );

function skeleton_app_block_admin() {
	if ( defined( 'DOING_AJAX' ) && DOING_AJAX ) {
		return;
	}
	if ( ! current_user_can( 'edit_posts' ) ) {
		$redirect = skeleton_app_get_team_url();
		wp_safe_redirect( $redirect );
		exit;
	}
}

/**
 * Protect /team/ (or whatever page hosts the shortcode): redirect to login
 * when a visitor is not authenticated.
 */
add_action( 'template_redirect', 'skeleton_app_protect_team_page' );

function skeleton_app_protect_team_page() {
	if ( is_user_logged_in() ) {
		return;
	}
	if ( ! skeleton_app_is_team_page() ) {
		return;
	}
	$login_url = wp_login_url( get_permalink() );
	wp_safe_redirect( $login_url );
	exit;
}

function skeleton_app_is_team_page() {
	global $post;
	if ( ! is_singular() || ! $post ) {
		return false;
	}
	return has_shortcode( $post->post_content, 'skeleton_app' );
}

function skeleton_app_get_team_url() {
	// Find a published page that contains the [skeleton_app] shortcode.
	$pages = get_posts( array(
		'post_type'      => 'page',
		'post_status'    => 'publish',
		'posts_per_page' => 50,
		'fields'         => 'all',
	) );
	foreach ( $pages as $page ) {
		if ( has_shortcode( $page->post_content, 'skeleton_app' ) ) {
			return get_permalink( $page->ID );
		}
	}
	return home_url( '/team/' );
}

// -------------------------------------------------------------------------
// SHORTCODE
// -------------------------------------------------------------------------

add_shortcode( 'skeleton_app', 'skeleton_app_shortcode' );

function skeleton_app_shortcode( $atts ) {
	// Assets are only enqueued when the shortcode is actually rendered.
	skeleton_app_enqueue_assets();

	ob_start();
	?>
	<div class="app-layout" id="skeleton-app-root">

	  <!-- ===== SIDEBAR ===== -->
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

	      <div class="nav-item active" id="nav-dashboard" onclick="navigate('dashboard')">
	        <span class="nav-icon">&#x1F4CA;</span>
	        <span>Dashboard</span>
	      </div>
	      <div class="nav-item" id="nav-workspaces" onclick="navigate('workspaces')">
	        <span class="nav-icon">&#x1F4C1;</span>
	        <span class="nav-ws-label">Arbejdsområder</span>
	        <span class="nav-ws-add-btn" onclick="event.stopPropagation();openNewWorkspaceModal();" title="Nyt arbejdsområde">+</span>
	      </div>

	      <!-- Dynamic workspace list injected by JS -->
	      <div id="sidebar-ws-list"></div>

	      <button class="sidebar-add-btn" onclick="openNewWorkspaceModal()">
	        <span>+</span>
	        <span>Nyt arbejdsområde</span>
	      </button>

	      <div style="margin-top:1.5rem;">
	        <div class="nav-section-label">System</div>
	        <div class="nav-item disabled">
	          <span class="nav-icon">&#x2699;&#xFE0F;</span>
	          <span>Indstillinger</span>
	        </div>
	      </div>
	    </nav>

	    <!-- Download app card -->
	    <div class="sidebar-download-card">
	      <div class="sdc-emoji">&#x1F4F1;</div>
	      <div class="sdc-title">Download vores app</div>
	      <div class="sdc-sub">Få adgang overalt</div>
	      <button class="sdc-btn">Download nu</button>
	    </div>
	  </aside>

	  <!-- ===== MAIN WRAPPER ===== -->
	  <div class="main-wrapper">

	    <!-- Global header (static) -->
	    <header class="global-header">
	      <div class="gh-search">
	        <span class="gh-search-icon">&#x1F50D;</span>
	        <input class="gh-search-input" type="text" placeholder="Søg efter initiativer, arbejdsområder...">
	        <span class="gh-search-hint">&#x2318;F</span>
	      </div>
	      <div class="gh-right">
	        <button class="gh-icon-btn" title="Notifikationer">&#x1F514;</button>
	        <button class="gh-icon-btn" title="Beskeder">&#x2709;&#xFE0F;</button>
	        <div class="gh-divider"></div>
	        <div class="gh-user">
	          <div class="gh-avatar">&#x1F464;</div>
	          <div class="gh-user-info">
	            <div class="gh-user-name">Bruger</div>
	            <div class="gh-user-email"></div>
	          </div>
	        </div>
	      </div>
	    </header>

	    <!-- Dynamic page content -->
	    <div class="main-content" id="main-content">
	      <!-- Rendered dynamically by JS -->
	    </div>

	  </div><!-- end .main-wrapper -->

	</div><!-- end .app-layout -->

	<!-- ===== MODAL: NYT ARBEJDSOMRADE ===== -->
	<div id="newWorkspaceModal" class="modal">
	  <div class="modal-content modal-sm">
	    <div class="modal-header">
	      <h2>Nyt arbejdsområde</h2>
	      <button class="close-btn" onclick="closeNewWorkspaceModal()">&#x00D7;</button>
	    </div>
	    <div class="form-grid">
	      <div class="form-field full">
	        <label class="form-label">Ikon (emoji)</label>
	        <input class="form-input" id="wsIcon" type="text" maxlength="4" value="📋" placeholder="📋">
	      </div>
	      <div class="form-field full">
	        <label class="form-label">Navn</label>
	        <input class="form-input" id="wsName" type="text" placeholder="Fx Sponsortiltrækning">
	      </div>
	      <div class="form-field full">
	        <label class="form-label">Beskrivelse</label>
	        <textarea class="form-textarea" id="wsDesc" placeholder="Hvad handler dette arbejdsområde om?"></textarea>
	      </div>
	    </div>
	    <div class="modal-actions">
	      <button class="btn-cancel" onclick="closeNewWorkspaceModal()">Annuller</button>
	      <button class="btn-save" onclick="saveNewWorkspace()">Opret</button>
	    </div>
	  </div>
	</div>

	<!-- ===== MODAL: NYT INITIATIV ===== -->
	<div id="newInitiativeModal" class="modal">
	  <div class="modal-content">
	    <div class="modal-header">
	      <h2>Nyt initiativ</h2>
	      <button class="close-btn" onclick="closeNewInitiativeModal()">&#x00D7;</button>
	    </div>
	    <div class="form-grid">
	      <div class="form-field full">
	        <label class="form-label">Titel</label>
	        <input class="form-input" id="initTitle" type="text" placeholder="Eksempel: Stat-bar med live resultater">
	      </div>
	      <div class="form-field full">
	        <label class="form-label">Status</label>
	        <select class="form-select" id="initStatus">
	          <option value="ide">Idé</option>
	          <option value="planlagt">Planlagt</option>
	          <option value="igang">Igang</option>
	          <option value="afsluttet">Afsluttet</option>
	        </select>
	      </div>
	      <div class="form-field full">
	        <label class="form-label">Målgruppe</label>
	        <div class="form-checkboxes">
	          <div class="form-checkbox">
	            <input type="checkbox" id="initAudSponsor" value="sponsor">
	            <label for="initAudSponsor">Sponsor</label>
	          </div>
	          <div class="form-checkbox">
	            <input type="checkbox" id="initAudFan" value="fan">
	            <label for="initAudFan">Fan</label>
	          </div>
	          <div class="form-checkbox">
	            <input type="checkbox" id="initAudFrivillig" value="frivillig">
	            <label for="initAudFrivillig">Frivillig</label>
	          </div>
	        </div>
	      </div>
	      <div class="form-field full">
	        <label class="form-label">Kort beskrivelse</label>
	        <input class="form-input" id="initShortDesc" type="text" placeholder="En linje beskrivelse">
	      </div>
	      <div class="form-field full">
	        <label class="form-label">Detaljer</label>
	        <textarea class="form-textarea" id="initDetails" placeholder="Fuldstændig beskrivelse..."></textarea>
	      </div>
	      <div class="form-field">
	        <label class="form-label">Påvirkning</label>
	        <input class="form-input" id="initImpact" type="text" placeholder="Eksempel: Højere engagement">
	      </div>
	      <div class="form-field">
	        <label class="form-label">ROI (0–10)</label>
	        <input class="form-input" id="initROI" type="number" min="0" max="10" placeholder="7">
	      </div>
	      <div class="form-field">
	        <label class="form-label">Estimeret pris (DKK)</label>
	        <input class="form-input" id="initCost" type="number" min="0" placeholder="5000">
	      </div>
	      <div class="form-field">
	        <label class="form-label">Deadline</label>
	        <input class="form-input" id="initDeadline" type="date">
	      </div>
	      <div class="form-field full">
	        <label class="form-label">Tidshorisont</label>
	        <div class="slider-wrap">
	          <input type="range" class="horizon-slider" id="initTimeHorizon" min="0" max="3" step="1" value="1">
	          <span class="horizon-label" id="initTimeHorizonLabel">Uger</span>
	        </div>
	        <div class="slider-ticks">
	          <span>Dage</span><span>Uger</span><span>Måneder</span><span>År</span>
	        </div>
	      </div>
	      <div class="form-field">
	        <label class="form-label">Vanskelighed</label>
	        <div class="circle-selector" id="initImplCircles">
	          <button type="button" class="circ-btn green selected" data-val="lav"><span class="dot"></span>Lav</button>
	          <button type="button" class="circ-btn yellow" data-val="middel"><span class="dot"></span>Middel</button>
	          <button type="button" class="circ-btn red" data-val="høj"><span class="dot"></span>Høj</button>
	        </div>
	        <input type="hidden" id="initImpl" value="lav">
	      </div>
	      <div class="form-field">
	        <label class="form-label">Estimeret effekt</label>
	        <div class="circle-selector" id="initEffectCircles">
	          <button type="button" class="circ-btn green selected" data-val="lav"><span class="dot"></span>Lav</button>
	          <button type="button" class="circ-btn yellow" data-val="middel"><span class="dot"></span>Middel</button>
	          <button type="button" class="circ-btn red" data-val="høj"><span class="dot"></span>Høj</button>
	        </div>
	        <input type="hidden" id="initEffect" value="lav">
	      </div>
	    </div>
	    <div class="modal-actions">
	      <button class="btn-cancel" onclick="closeNewInitiativeModal()">Annuller</button>
	      <button class="btn-save" onclick="saveNewInitiative()">Gem initiativ</button>
	    </div>
	  </div>
	</div>
	<?php
	return ob_get_clean();
}

// -------------------------------------------------------------------------
// ASSET ENQUEUEING
// -------------------------------------------------------------------------

function skeleton_app_enqueue_assets() {
	$ver = SKELETON_APP_VERSION;

	wp_enqueue_style(
		'skeleton-app',
		SKELETON_APP_URL . 'assets/styles.css',
		array(),
		$ver
	);

	wp_enqueue_script(
		'skeleton-app',
		SKELETON_APP_URL . 'assets/app.js',
		array(),
		$ver,
		true  // load in footer
	);

	$current_user = wp_get_current_user();
	wp_localize_script(
		'skeleton-app',
		'skeletonApp',
		array(
			'restUrl'     => rest_url( 'skeleton/v1/' ),
			'nonce'       => wp_create_nonce( 'wp_rest' ),
			'currentUser' => array(
				'id'    => $current_user->ID,
				'name'  => $current_user->display_name ? $current_user->display_name : $current_user->user_login,
				'email' => $current_user->user_email,
			),
		)
	);
}

// -------------------------------------------------------------------------
// REST API
// -------------------------------------------------------------------------

add_action( 'rest_api_init', 'skeleton_app_register_routes' );

function skeleton_app_register_routes() {
	register_rest_route(
		'skeleton/v1',
		'/workspaces',
		array(
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => 'skeleton_rest_get_workspaces',
				'permission_callback' => 'skeleton_rest_permissions',
			),
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => 'skeleton_rest_create_workspace',
				'permission_callback' => 'skeleton_rest_permissions',
				'args'                => skeleton_workspace_args(),
			),
		)
	);

	register_rest_route(
		'skeleton/v1',
		'/initiatives',
		array(
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => 'skeleton_rest_get_initiatives',
				'permission_callback' => 'skeleton_rest_permissions',
				'args'                => array(
					'workspaceId' => array(
						'type'              => 'integer',
						'sanitize_callback' => 'absint',
					),
				),
			),
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => 'skeleton_rest_create_initiative',
				'permission_callback' => 'skeleton_rest_permissions',
				'args'                => skeleton_initiative_args(),
			),
		)
	);

	register_rest_route(
		'skeleton/v1',
		'/initiatives/(?P<id>\d+)',
		array(
			array(
				'methods'             => 'PATCH',
				'callback'            => 'skeleton_rest_update_initiative',
				'permission_callback' => 'skeleton_rest_permissions',
				'args'                => array(
					'id' => array(
						'type'              => 'integer',
						'required'          => true,
						'sanitize_callback' => 'absint',
					),
				),
			),
			array(
				'methods'             => WP_REST_Server::DELETABLE,
				'callback'            => 'skeleton_rest_delete_initiative',
				'permission_callback' => 'skeleton_rest_permissions',
				'args'                => array(
					'id' => array(
						'type'              => 'integer',
						'required'          => true,
						'sanitize_callback' => 'absint',
					),
				),
			),
		)
	);
}

function skeleton_rest_permissions( WP_REST_Request $request ) {
	if ( ! is_user_logged_in() ) {
		return new WP_Error(
			'rest_not_logged_in',
			__( 'Du skal være logget ind for at bruge denne funktion.', 'skeleton-team-app' ),
			array( 'status' => 401 )
		);
	}
	if ( ! current_user_can( 'skeleton_manage_data' ) ) {
		return new WP_Error(
			'rest_forbidden',
			__( 'Du har ikke adgang til denne funktion.', 'skeleton-team-app' ),
			array( 'status' => 403 )
		);
	}
	return true;
}

// ----- Workspaces -----

function skeleton_rest_get_workspaces( WP_REST_Request $request ) {
	global $wpdb;
	$workspaces_table  = $wpdb->prefix . 'skeleton_workspaces';
	$initiatives_table = $wpdb->prefix . 'skeleton_initiatives';

	// phpcs:ignore WordPress.DB.DirectDatabaseQuery
	$rows = $wpdb->get_results( "SELECT * FROM {$workspaces_table} ORDER BY id ASC", ARRAY_A );
	if ( $rows === null ) {
		return new WP_Error( 'db_error', $wpdb->last_error, array( 'status' => 500 ) );
	}

	$result = array();
	foreach ( $rows as $row ) {
		$ws_id = (int) $row['id'];
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery
		$initiatives = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$initiatives_table} WHERE workspace_id = %d ORDER BY id ASC",
				$ws_id
			),
			ARRAY_A
		);
		$result[] = skeleton_format_workspace( $row, $initiatives ?: array() );
	}
	return rest_ensure_response( $result );
}

function skeleton_rest_create_workspace( WP_REST_Request $request ) {
	global $wpdb;
	$table = $wpdb->prefix . 'skeleton_workspaces';
	$data  = array(
		'icon'        => $request->get_param( 'icon' )        ?: '📋',
		'name'        => sanitize_text_field( $request->get_param( 'name' ) ),
		'description' => sanitize_textarea_field( $request->get_param( 'description' ) ?: '' ),
	);

	// phpcs:ignore WordPress.DB.DirectDatabaseQuery
	$inserted = $wpdb->insert( $table, $data );
	if ( $inserted === false ) {
		return new WP_Error( 'db_error', $wpdb->last_error, array( 'status' => 500 ) );
	}

	$id = $wpdb->insert_id;
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery
	$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $id ), ARRAY_A );

	return rest_ensure_response( skeleton_format_workspace( $row, array() ) );
}

// ----- Initiatives -----

function skeleton_rest_get_initiatives( WP_REST_Request $request ) {
	global $wpdb;
	$table       = $wpdb->prefix . 'skeleton_initiatives';
	$workspace_id = $request->get_param( 'workspaceId' );

	if ( $workspace_id ) {
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery
		$rows = $wpdb->get_results(
			$wpdb->prepare( "SELECT * FROM {$table} WHERE workspace_id = %d ORDER BY id ASC", $workspace_id ),
			ARRAY_A
		);
	} else {
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery
		$rows = $wpdb->get_results( "SELECT * FROM {$table} ORDER BY id ASC", ARRAY_A );
	}

	$result = array_map( 'skeleton_format_initiative', $rows ?: array() );
	return rest_ensure_response( $result );
}

function skeleton_rest_create_initiative( WP_REST_Request $request ) {
	global $wpdb;
	$table = $wpdb->prefix . 'skeleton_initiatives';

	$workspace_id = absint( $request->get_param( 'workspaceId' ) );
	if ( ! $workspace_id ) {
		return new WP_Error( 'missing_workspace', __( 'workspaceId er påkrævet.', 'skeleton-team-app' ), array( 'status' => 400 ) );
	}

	// Verify workspace exists.
	$ws_table = $wpdb->prefix . 'skeleton_workspaces';
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery
	$ws_exists = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$ws_table} WHERE id = %d", $workspace_id ) );
	if ( ! $ws_exists ) {
		return new WP_Error( 'invalid_workspace', __( 'Arbejdsområdet findes ikke.', 'skeleton-team-app' ), array( 'status' => 404 ) );
	}

	$audiences = $request->get_param( 'audiences' );
	if ( ! is_array( $audiences ) ) {
		$audiences = array( 'all' );
	}
	$audiences = array_map( 'sanitize_text_field', $audiences );

	$deadline = $request->get_param( 'deadline' );
	if ( $deadline && ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $deadline ) ) {
		$deadline = null;
	}

	$data = array(
		'workspace_id'  => $workspace_id,
		'title'         => sanitize_text_field( $request->get_param( 'title' ) ),
		'status'        => skeleton_sanitize_status( $request->get_param( 'status' ) ),
		'short_desc'    => sanitize_textarea_field( $request->get_param( 'shortDesc' ) ?: '' ),
		'details'       => sanitize_textarea_field( $request->get_param( 'details' )   ?: '' ),
		'impact'        => sanitize_text_field( $request->get_param( 'impact' ) ?: '' ),
		'roi'           => min( 10, max( 0, absint( $request->get_param( 'roi' ) ) ) ),
		'cost'          => absint( $request->get_param( 'cost' ) ),
		'impl'          => skeleton_sanitize_level( $request->get_param( 'impl' ) ),
		'effect'        => skeleton_sanitize_level( $request->get_param( 'effect' ) ),
		'deadline'      => $deadline ?: null,
		'time_horizon'  => skeleton_sanitize_horizon( $request->get_param( 'timeHorizon' ) ),
		'audiences_json'=> wp_json_encode( $audiences ),
	);

	// phpcs:ignore WordPress.DB.DirectDatabaseQuery
	$inserted = $wpdb->insert( $table, $data );
	if ( $inserted === false ) {
		return new WP_Error( 'db_error', $wpdb->last_error, array( 'status' => 500 ) );
	}

	$id = $wpdb->insert_id;
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery
	$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $id ), ARRAY_A );

	return rest_ensure_response( skeleton_format_initiative( $row ) );
}

function skeleton_rest_update_initiative( WP_REST_Request $request ) {
	global $wpdb;
	$table = $wpdb->prefix . 'skeleton_initiatives';
	$id    = absint( $request->get_param( 'id' ) );

	// phpcs:ignore WordPress.DB.DirectDatabaseQuery
	$existing = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $id ), ARRAY_A );
	if ( ! $existing ) {
		return new WP_Error( 'not_found', __( 'Initiativet findes ikke.', 'skeleton-team-app' ), array( 'status' => 404 ) );
	}

	$update = array();

	if ( null !== $request->get_param( 'status' ) ) {
		$update['status'] = skeleton_sanitize_status( $request->get_param( 'status' ) );
	}
	if ( null !== $request->get_param( 'title' ) ) {
		$update['title'] = sanitize_text_field( $request->get_param( 'title' ) );
	}
	if ( null !== $request->get_param( 'shortDesc' ) ) {
		$update['short_desc'] = sanitize_textarea_field( $request->get_param( 'shortDesc' ) );
	}
	if ( null !== $request->get_param( 'details' ) ) {
		$update['details'] = sanitize_textarea_field( $request->get_param( 'details' ) );
	}
	if ( null !== $request->get_param( 'impact' ) ) {
		$update['impact'] = sanitize_text_field( $request->get_param( 'impact' ) );
	}
	if ( null !== $request->get_param( 'roi' ) ) {
		$update['roi'] = min( 10, max( 0, absint( $request->get_param( 'roi' ) ) ) );
	}
	if ( null !== $request->get_param( 'cost' ) ) {
		$update['cost'] = absint( $request->get_param( 'cost' ) );
	}
	if ( null !== $request->get_param( 'impl' ) ) {
		$update['impl'] = skeleton_sanitize_level( $request->get_param( 'impl' ) );
	}
	if ( null !== $request->get_param( 'effect' ) ) {
		$update['effect'] = skeleton_sanitize_level( $request->get_param( 'effect' ) );
	}
	if ( null !== $request->get_param( 'deadline' ) ) {
		$dl = $request->get_param( 'deadline' );
		$update['deadline'] = ( $dl && preg_match( '/^\d{4}-\d{2}-\d{2}$/', $dl ) ) ? $dl : null;
	}
	if ( null !== $request->get_param( 'timeHorizon' ) ) {
		$update['time_horizon'] = skeleton_sanitize_horizon( $request->get_param( 'timeHorizon' ) );
	}
	if ( null !== $request->get_param( 'audiences' ) ) {
		$aud = $request->get_param( 'audiences' );
		$update['audiences_json'] = wp_json_encode( is_array( $aud ) ? array_map( 'sanitize_text_field', $aud ) : array( 'all' ) );
	}

	if ( empty( $update ) ) {
		return rest_ensure_response( skeleton_format_initiative( $existing ) );
	}

	// phpcs:ignore WordPress.DB.DirectDatabaseQuery
	$wpdb->update( $table, $update, array( 'id' => $id ) );
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery
	$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $id ), ARRAY_A );

	return rest_ensure_response( skeleton_format_initiative( $row ) );
}

function skeleton_rest_delete_initiative( WP_REST_Request $request ) {
	global $wpdb;
	$table = $wpdb->prefix . 'skeleton_initiatives';
	$id    = absint( $request->get_param( 'id' ) );

	// phpcs:ignore WordPress.DB.DirectDatabaseQuery
	$existing = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$table} WHERE id = %d", $id ) );
	if ( ! $existing ) {
		return new WP_Error( 'not_found', __( 'Initiativet findes ikke.', 'skeleton-team-app' ), array( 'status' => 404 ) );
	}

	// phpcs:ignore WordPress.DB.DirectDatabaseQuery
	$wpdb->delete( $table, array( 'id' => $id ) );

	return rest_ensure_response( array( 'deleted' => true, 'id' => $id ) );
}

// -------------------------------------------------------------------------
// SEED DATA (runs on activation only if tables are empty)
// -------------------------------------------------------------------------

function skeleton_app_seed_data() {
	global $wpdb;
	$ws_table = $wpdb->prefix . 'skeleton_workspaces';
	$in_table = $wpdb->prefix . 'skeleton_initiatives';

	// phpcs:ignore WordPress.DB.DirectDatabaseQuery
	$existing = $wpdb->get_var( "SELECT COUNT(*) FROM {$ws_table}" );
	if ( $existing && $existing > 0 ) {
		return; // Already has data.
	}

	// Seed workspace 1: Sponsortiltrækning
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery
	$wpdb->insert(
		$ws_table,
		array(
			'icon'        => '🤝',
			'name'        => 'Sponsortiltrækning',
			'description' => 'Initiativer til at tiltrække og fastholde sponsorer.',
		)
	);
	$ws1_id = $wpdb->insert_id;

	// phpcs:ignore WordPress.DB.DirectDatabaseQuery
	$wpdb->insert(
		$in_table,
		array(
			'workspace_id'  => $ws1_id,
			'title'         => 'Sponsor-pakker 2025',
			'status'        => 'planlagt',
			'short_desc'    => 'Opdater sponsor-pakker med nye fordele',
			'details'       => 'Gennemgå og opdater de eksisterende sponsor-pakker med attraktive nye fordele for sæson 2025.',
			'impact'        => 'Øget sponsorindtægt',
			'roi'           => 8,
			'cost'          => 5000,
			'impl'          => 'lav',
			'effect'        => 'høj',
			'deadline'      => gmdate( 'Y-m-d', strtotime( '+60 days' ) ),
			'time_horizon'  => 'måneder',
			'audiences_json'=> wp_json_encode( array( 'sponsor' ) ),
		)
	);

	// phpcs:ignore WordPress.DB.DirectDatabaseQuery
	$wpdb->insert(
		$in_table,
		array(
			'workspace_id'  => $ws1_id,
			'title'         => 'Sponsor-event Q3',
			'status'        => 'ide',
			'short_desc'    => 'Netværksevent for nuværende og potentielle sponsorer',
			'details'       => '',
			'impact'        => 'Stærkere relationer',
			'roi'           => 7,
			'cost'          => 15000,
			'impl'          => 'middel',
			'effect'        => 'høj',
			'deadline'      => null,
			'time_horizon'  => 'måneder',
			'audiences_json'=> wp_json_encode( array( 'sponsor' ) ),
		)
	);

	// Seed workspace 2: Fanoplevelse
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery
	$wpdb->insert(
		$ws_table,
		array(
			'icon'        => '🎉',
			'name'        => 'Fanoplevelse',
			'description' => 'Forbedring af oplevelsen for fans ved kampe og events.',
		)
	);
	$ws2_id = $wpdb->insert_id;

	// phpcs:ignore WordPress.DB.DirectDatabaseQuery
	$wpdb->insert(
		$in_table,
		array(
			'workspace_id'  => $ws2_id,
			'title'         => 'Live score-display på stadion',
			'status'        => 'igang',
			'short_desc'    => 'Storskærme med live resultater og statistikker',
			'details'       => 'Opsætning af storskærme i hele stadion der viser live scores, spillerstatistikker og kampinfo.',
			'impact'        => 'Højere engagement på stadion',
			'roi'           => 9,
			'cost'          => 80000,
			'impl'          => 'høj',
			'effect'        => 'høj',
			'deadline'      => gmdate( 'Y-m-d', strtotime( '+90 days' ) ),
			'time_horizon'  => 'måneder',
			'audiences_json'=> wp_json_encode( array( 'fan' ) ),
		)
	);
}

// -------------------------------------------------------------------------
// DATA FORMATTING HELPERS
// -------------------------------------------------------------------------

function skeleton_format_workspace( array $row, array $initiatives ) {
	return array(
		'id'          => (int) $row['id'],
		'icon'        => $row['icon'],
		'name'        => $row['name'],
		'description' => $row['description'],
		'createdAt'   => $row['created_at'],
		'updatedAt'   => $row['updated_at'],
		'initiatives' => array_values( array_map( 'skeleton_format_initiative', $initiatives ) ),
	);
}

function skeleton_format_initiative( array $row ) {
	$audiences = json_decode( $row['audiences_json'] ?? '["all"]', true );
	if ( ! is_array( $audiences ) ) {
		$audiences = array( 'all' );
	}
	return array(
		'id'          => (int) $row['id'],
		'workspaceId' => (int) $row['workspace_id'],
		'title'       => $row['title'],
		'status'      => $row['status'],
		'shortDesc'   => $row['short_desc'],
		'details'     => $row['details'],
		'impact'      => $row['impact'],
		'roi'         => (int) $row['roi'],
		'cost'        => (int) $row['cost'],
		'impl'        => $row['impl'],
		'effect'      => $row['effect'],
		'deadline'    => $row['deadline'],
		'timeHorizon' => $row['time_horizon'],
		'audiences'   => $audiences,
		'createdAt'   => $row['created_at'],
		'updatedAt'   => $row['updated_at'],
	);
}

// -------------------------------------------------------------------------
// SANITIZATION HELPERS
// -------------------------------------------------------------------------

function skeleton_sanitize_status( $value ) {
	$allowed = array( 'ide', 'planlagt', 'igang', 'afsluttet' );
	return in_array( $value, $allowed, true ) ? $value : 'ide';
}

function skeleton_sanitize_level( $value ) {
	$allowed = array( 'lav', 'middel', 'høj' );
	return in_array( $value, $allowed, true ) ? $value : 'lav';
}

function skeleton_sanitize_horizon( $value ) {
	$allowed = array( 'dage', 'uger', 'måneder', 'år' );
	return in_array( $value, $allowed, true ) ? $value : 'uger';
}

// -------------------------------------------------------------------------
// ARG SCHEMAS (shared by REST route registration)
// -------------------------------------------------------------------------

function skeleton_workspace_args() {
	return array(
		'name' => array(
			'type'              => 'string',
			'required'          => true,
			'sanitize_callback' => 'sanitize_text_field',
		),
		'icon' => array(
			'type'              => 'string',
			'sanitize_callback' => 'sanitize_text_field',
		),
		'description' => array(
			'type'              => 'string',
			'sanitize_callback' => 'sanitize_textarea_field',
		),
	);
}

function skeleton_initiative_args() {
	return array(
		'workspaceId' => array(
			'type'              => 'integer',
			'required'          => true,
			'sanitize_callback' => 'absint',
		),
		'title' => array(
			'type'              => 'string',
			'required'          => true,
			'sanitize_callback' => 'sanitize_text_field',
		),
		'status' => array(
			'type'              => 'string',
			'sanitize_callback' => 'skeleton_sanitize_status',
		),
		'audiences' => array(
			'type'  => 'array',
			'items' => array( 'type' => 'string' ),
		),
	);
}
