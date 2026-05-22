<?php
/**
 * Registers the Pressship WP-CLI bridge command.
 *
 * The implementation intentionally delegates to the Node.js Pressship package
 * instead of duplicating publishing logic in PHP.
 */

if ( ! class_exists( 'WP_CLI' ) ) {
	return;
}

if ( ! class_exists( 'Pressship_WP_CLI_Command' ) ) {
	require_once __DIR__ . '/src/Pressship_WP_CLI_Command.php';
}

WP_CLI::add_command(
	'ship',
	'Pressship_WP_CLI_Command',
	array(
		'shortdesc' => 'Run the Pressship WordPress.org plugin publishing CLI.',
		'when'      => 'before_wp_load',
	)
);
