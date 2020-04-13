/**
 * External dependencies
 */
import React from 'react';
import { connect } from 'react-redux';
import { createHistory } from 'history';
import { withRouter } from 'react-router';
import { translate as __ } from 'i18n-calypso';

/**
 * Internal dependencies
 */
import Masthead from 'components/masthead';
import Navigation from 'components/navigation';
import NavigationSettings from 'components/navigation-settings';
import SearchableSettings from 'settings/index.jsx';
import { getSiteConnectionStatus, isCurrentUserLinked, isSiteConnected } from 'state/connection';
import {
	setInitialState,
	getSiteRawUrl,
	getSiteAdminUrl,
	getApiNonce,
	getApiRootUrl,
	userCanManageModules,
	userCanConnectSite,
	getCurrentVersion,
	getTracksUserData,
} from 'state/initial-state';
import { areThereUnsavedSettings, clearUnsavedSettingsFlag } from 'state/settings';
import { getSearchTerm } from 'state/search';
import { SetupWizard } from 'setup-wizard';
import AtAGlance from 'at-a-glance/index.jsx';
import MyPlan from 'my-plan/index.jsx';
import Plans from 'plans/index.jsx';
import PlansPrompt from 'plans-prompt/index.jsx';
import Footer from 'components/footer';
import SupportCard from 'components/support-card';
import AppsCard from 'components/apps-card';
import NonAdminView from 'components/non-admin-view';
import JetpackNotices from 'components/jetpack-notices';
import AdminNotices from 'components/admin-notices';
import Tracker from 'components/tracker';
import analytics from 'lib/analytics';
import restApi from 'rest-api';
import QueryRewindStatus from 'components/data/query-rewind-status';
import { getRewindStatus } from 'state/rewind';

const defaultRoute = '/';
const setupRoute = '/setup';
const dashboardRoute = '/dashboard';
const myPlanRoute = '/my-plan';
const plansRoute = '/plans';
const plansPromptRoute = '/plans-prompt';

const dashboardRoutes = [ defaultRoute, dashboardRoute, myPlanRoute, plansRoute ];
const settingsRoutes = [
	'/settings',
	'/security',
	'/performance',
	'/writing',
	'/sharing',
	'/discussion',
	'/traffic',
	'/privacy',
];

class Main extends React.Component {
	UNSAFE_componentWillMount() {
		this.props.setInitialState();
		restApi.setApiRoot( this.props.apiRoot );
		restApi.setApiNonce( this.props.apiNonce );
		this.initializeAnalytics();

		// Handles refresh, closing and navigating away from Jetpack's Admin Page
		window.addEventListener( 'beforeunload', this.onBeforeUnload );
		// Handles transition between routes handled by react-router
		this.props.router.listenBefore( this.routerWillLeave );

		// Track initial page view
		this.props.isSiteConnected &&
			analytics.tracks.recordEvent( 'jetpack_wpa_page_view', {
				path: this.props.route.path,
				current_version: this.props.currentVersion,
			} );
	}

	componentDidMount() {
		// If we have a div that's only found on the Jetpack dashboard when not connected,
		// let's move the connection banner inside that div, inside the React page.
		const connectReactContainer = jQuery( '.jp-jetpack-connect__container' );
		const fullScreenContainer = jQuery( '.jp-connect-full__container' );
		if ( connectReactContainer && fullScreenContainer.length > 0 ) {
			fullScreenContainer.prependTo( connectReactContainer );
		}
	}

	/*
	 * Returns a string if there are unsaved module settings thus showing a confirm dialog to the user
	 * according to the `beforeunload` event handling specification
	 */
	onBeforeUnload = () => {
		if ( this.props.areThereUnsavedSettings ) {
			if (
				confirm(
					__( 'There are unsaved settings in this tab that will be lost if you leave it. Proceed?' )
				)
			) {
				this.props.clearUnsavedSettingsFlag();
			} else {
				return false;
			}
		}
	};

	/*
	 * Shows a confirmation dialog if there are unsaved module settings.
	 *
	 * Return true or false according to the history.listenBefore specification which is part of react-router
	 */
	routerWillLeave = () => {
		if ( this.props.areThereUnsavedSettings ) {
			if (
				confirm(
					__( 'There are unsaved settings in this tab that will be lost if you leave it. Proceed?' )
				)
			) {
				window.setTimeout( this.props.clearUnsavedSettingsFlag, 10 );
			} else {
				return false;
			}
		}
	};

	initializeAnalytics = () => {
		const tracksUser = this.props.tracksUserData;

		if ( tracksUser ) {
			analytics.initialize( tracksUser.userid, tracksUser.username, {
				blog_id: tracksUser.blogid,
			} );
		}
	};

	shouldComponentUpdate( nextProps ) {
		// If user triggers Skip to main content or Skip to toolbar with keyboard navigation, stay in the same tab.
		if ( [ '/wpbody-content', '/wp-toolbar' ].includes( nextProps.route.path ) ) {
			return false;
		}

		return (
			nextProps.siteConnectionStatus !== this.props.siteConnectionStatus ||
			nextProps.isLinked !== this.props.isLinked ||
			nextProps.route.path !== this.props.route.path ||
			nextProps.searchTerm !== this.props.searchTerm ||
			nextProps.rewindStatus !== this.props.rewindStatus
		);
	}

	componentDidUpdate( prevProps ) {
		// Track page view on change only
		prevProps.route.path !== this.props.route.path &&
			this.props.isSiteConnected &&
			analytics.tracks.recordEvent( 'jetpack_wpa_page_view', {
				path: this.props.route.path,
				current_version: this.props.currentVersion,
			} );

		// Not taking into account development mode here because changing the connection
		// status without reloading is possible only by disconnecting a live site not
		// in development mode.
		if ( prevProps.siteConnectionStatus !== this.props.siteConnectionStatus ) {
			const $items = jQuery( '#toplevel_page_jetpack' ).find( 'ul.wp-submenu li' );
			$items.find( 'a[href$="#/settings"]' ).hide();
			$items.find( 'a[href$="admin.php?page=stats"]' ).hide();
		}
	}

	renderMainContent = route => {
		if ( ! this.props.userCanManageModules ) {
			if ( ! this.props.siteConnectionStatus ) {
				return false;
			}
			return (
				<div aria-live="assertive">
					<NonAdminView { ...this.props } />
				</div>
			);
		}

		if ( false === this.props.siteConnectionStatus && this.props.userCanConnectSite ) {
			return <div className="jp-jetpack-connect__container" aria-live="assertive" />;
		}

		const settingsNav = (
			<NavigationSettings
				route={ this.props.route }
				siteRawUrl={ this.props.siteRawUrl }
				siteAdminUrl={ this.props.siteAdminUrl }
			/>
		);
		let pageComponent,
			navComponent = <Navigation route={ this.props.route } />;

		switch ( route ) {
			case '/dashboard':
				pageComponent = (
					<AtAGlance
						siteRawUrl={ this.props.siteRawUrl }
						siteAdminUrl={ this.props.siteAdminUrl }
						rewindStatus={ this.props.rewindStatus }
					/>
				);
				break;
			case '/my-plan':
				pageComponent = (
					<MyPlan
						siteRawUrl={ this.props.siteRawUrl }
						siteAdminUrl={ this.props.siteAdminUrl }
						rewindStatus={ this.props.rewindStatus }
					/>
				);
				break;
			case '/plans':
				pageComponent = (
					<Plans
						siteRawUrl={ this.props.siteRawUrl }
						siteAdminUrl={ this.props.siteAdminUrl }
						rewindStatus={ this.props.rewindStatus }
					/>
				);
				break;
			case '/plans-prompt':
				navComponent = null;
				pageComponent = <PlansPrompt siteAdminUrl={ this.props.siteAdminUrl } />;
				break;
			case '/settings':
			case '/security':
			case '/performance':
			case '/writing':
			case '/sharing':
			case '/discussion':
			case '/traffic':
			case '/privacy':
				navComponent = settingsNav;
				pageComponent = (
					<SearchableSettings
						route={ this.props.route }
						siteAdminUrl={ this.props.siteAdminUrl }
						siteRawUrl={ this.props.siteRawUrl }
						searchTerm={ this.props.searchTerm }
						rewindStatus={ this.props.rewindStatus }
						userCanManageModules={ this.props.userCanManageModules }
					/>
				);
				break;
			case '/setup':
				navComponent = null;
				pageComponent = <SetupWizard />;
				break;

			default:
				// TODO: remove, temporarily starting on the setup page
				const history = createHistory();
				history.replace( window.location.pathname + '?page=jetpack#/setup' );
			// If no route found, kick them to the dashboard and do some url/history trickery
			// history.replace( window.location.pathname + '?page=jetpack#/dashboard' );
			// pageComponent = (
			// 	<AtAGlance
			// 		siteRawUrl={ this.props.siteRawUrl }
			// 		siteAdminUrl={ this.props.siteAdminUrl }
			// 		rewindStatus={ this.props.rewindStatus }
			// 	/>
			// );
		}

		const indices =
			this.props.currentVersion.includes( 'alpha' ) || this.props.currentVersion.includes( 'beta' )
				? { setup: 1, dashboard: 2, settings: 3 }
				: { setup: -1, dashboard: 1, settings: 2 };

		window.wpNavMenuClassChange( indices );

		return (
			<div aria-live="assertive">
				{ navComponent }
				{ pageComponent }
			</div>
		);
	};

	shouldShowAppsCard() {
		// Only show on the dashboard
		return this.props.isSiteConnected && dashboardRoutes.includes( this.props.route.path );
	}

	shouldShowSupportCard() {
		// Only show on the dashboard
		return this.props.isSiteConnected && dashboardRoutes.includes( this.props.route.path );
	}

	shouldShowRewindStatus() {
		// Only show on the dashboard
		return this.props.isSiteConnected && dashboardRoutes.includes( this.props.route.path );
	}

	shouldShowMasthead() {
		// Only show on the dashboard and settings page
		return [ ...dashboardRoutes, ...settingsRoutes ].includes( this.props.route.path );
	}

	shouldShowFooter() {
		// Only show on the dashboard and settings page
		return [ ...dashboardRoutes, ...settingsRoutes ].includes( this.props.route.path );
	}

	render() {
		return (
			<div>
				{ this.shouldShowMasthead() && <Masthead route={ this.props.route } /> }
				<div className="jp-lower">
					{ this.shouldShowRewindStatus() && <QueryRewindStatus /> }
					<AdminNotices />
					<JetpackNotices />
					{ this.renderMainContent( this.props.route.path ) }
					{ this.shouldShowSupportCard() && <SupportCard path={ this.props.route.path } /> }
					{ this.shouldShowAppsCard() && <AppsCard /> }
				</div>
				{ this.shouldShowFooter() && <Footer siteAdminUrl={ this.props.siteAdminUrl } /> }
				<Tracker analytics={ analytics } />
			</div>
		);
	}
}

export default connect(
	state => {
		return {
			siteConnectionStatus: getSiteConnectionStatus( state ),
			isLinked: isCurrentUserLinked( state ),
			siteRawUrl: getSiteRawUrl( state ),
			siteAdminUrl: getSiteAdminUrl( state ),
			searchTerm: getSearchTerm( state ),
			apiRoot: getApiRootUrl( state ),
			apiNonce: getApiNonce( state ),
			tracksUserData: getTracksUserData( state ),
			areThereUnsavedSettings: areThereUnsavedSettings( state ),
			userCanManageModules: userCanManageModules( state ),
			userCanConnectSite: userCanConnectSite( state ),
			isSiteConnected: isSiteConnected( state ),
			rewindStatus: getRewindStatus( state ),
			currentVersion: getCurrentVersion( state ),
		};
	},
	dispatch => ( {
		setInitialState: () => {
			return dispatch( setInitialState() );
		},
		clearUnsavedSettingsFlag: () => {
			return dispatch( clearUnsavedSettingsFlag() );
		},
	} )
)( withRouter( Main ) );

/**
 * Hack for changing the sub-nav menu core classes for 'settings' and 'dashboard'
 */
window.wpNavMenuClassChange = function( pageOrder = { setup: -1, dashboard: 1, settings: 2 } ) {
	let hash = window.location.hash;

	// Clear currents
	jQuery( '.current' ).each( function( i, obj ) {
		jQuery( obj ).removeClass( 'current' );
	} );

	hash = hash.split( '?' )[ 0 ].replace( /#/, '' );

	if ( hash === setupRoute ) {
		const subNavItem = jQuery( '#toplevel_page_jetpack' )
			.find( 'li' )
			.filter( function( index ) {
				return index === pageOrder.setup;
			} );
		subNavItem[ 0 ].classList.add( 'current' );
	} else if ( dashboardRoutes.includes( hash ) ) {
		const subNavItem = jQuery( '#toplevel_page_jetpack' )
			.find( 'li' )
			.filter( function( index ) {
				return index === pageOrder.dashboard;
			} );
		subNavItem[ 0 ].classList.add( 'current' );
	} else if ( settingsRoutes.includes( hash ) ) {
		const subNavItem = jQuery( '#toplevel_page_jetpack' )
			.find( 'li' )
			.filter( function( index ) {
				return index === pageOrder.settings;
			} );
		subNavItem[ 0 ].classList.add( 'current' );
	}

	const $body = jQuery( 'body' );

	$body.on(
		'click',
		'a[href$="#/dashboard"], a[href$="#/settings"], .jp-dash-section-header__settings[href="#/security"], .dops-button[href="#/my-plan"], .dops-button[href="#/plans"], .jp-dash-section-header__external-link[href="#/security"]',
		function() {
			window.scrollTo( 0, 0 );
		}
	);

	$body.on( 'click', '.jetpack-js-stop-propagation', function( e ) {
		e.stopPropagation();
	} );
};
