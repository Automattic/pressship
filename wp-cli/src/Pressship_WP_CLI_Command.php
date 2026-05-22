<?php
/**
 * WP-CLI command bridge for Pressship.
 */

/**
 * Run Pressship through WP-CLI.
 */
class Pressship_WP_CLI_Command {
	/**
	 * Invoke Pressship.
	 *
	 * This command forwards all arguments to the Node.js Pressship CLI through npx.
	 *
	 * ## OPTIONS
	 *
	 * [<args>...]
	 * : Arguments passed through to Pressship.
	 *
	 * [--<field>=<value>]
	 * : Options passed through to Pressship.
	 *
	 * ## EXAMPLES
	 *
	 *     wp ship verify ./my-plugin
	 *     wp ship pack ./my-plugin --json
	 *     wp ship publish ./my-plugin --dry-run
	 *
	 * @when before_wp_load
	 *
	 * @param array<int, string>       $args       Positional arguments.
	 * @param array<string, mixed>     $assoc_args Associative arguments.
	 * @return void
	 */
	public function __invoke( $args, $assoc_args ) {
		$command = self::build_command( $args, $assoc_args );

		$descriptors = array( STDIN, STDOUT, STDERR );
		$process     = proc_open( $command, $descriptors, $pipes );
		if ( ! is_resource( $process ) ) {
			WP_CLI::error( 'Could not start Pressship through npx.' );
		}

		exit( proc_close( $process ) );
	}

	/**
	 * Build the npx command.
	 *
	 * @param array<int, string>   $args       Positional arguments.
	 * @param array<string, mixed> $assoc_args Associative arguments.
	 * @return string
	 */
	public static function build_command( $args, $assoc_args ) {
		$npx     = getenv( 'PRESSSHIP_NPX' ) ?: self::default_npx_binary();
		$package = getenv( 'PRESSSHIP_NPX_PACKAGE' ) ?: self::default_npx_package();
		$argv    = array_merge(
			array( $npx, '--yes', '--prefix', self::npx_prefix_dir(), '--package', $package, 'pressship' ),
			array_values( $args ),
			self::assoc_args_to_argv( $assoc_args )
		);

		return self::escape_command( $argv );
	}

	/**
	 * Convert WP-CLI associative arguments to Pressship argv flags.
	 *
	 * @param array<string, mixed> $assoc_args Associative arguments.
	 * @return array<int, string>
	 */
	public static function assoc_args_to_argv( $assoc_args ) {
		$argv = array();

		foreach ( $assoc_args as $name => $value ) {
			if ( 'format' === $name && 'json' === $value ) {
				$argv[] = '--json';
				continue;
			}

			if ( is_array( $value ) ) {
				foreach ( $value as $item ) {
					$argv[] = self::format_assoc_arg( $name, $item );
				}
				continue;
			}

			$argv[] = self::format_assoc_arg( $name, $value );
		}

		return $argv;
	}

	/**
	 * Format one WP-CLI associative argument.
	 *
	 * @param string $name  Argument name.
	 * @param mixed  $value Argument value.
	 * @return string
	 */
	private static function format_assoc_arg( $name, $value ) {
		if ( false === $value ) {
			return '--no-' . $name;
		}

		if ( true === $value ) {
			return '--' . $name;
		}

		return '--' . $name . '=' . (string) $value;
	}

	/**
	 * Escape argv as a shell command.
	 *
	 * @param array<int, string> $argv Command argv.
	 * @return string
	 */
	private static function escape_command( $argv ) {
		return implode( ' ', array_map( 'escapeshellarg', $argv ) );
	}

	/**
	 * Default npx binary.
	 *
	 * @return string
	 */
	private static function default_npx_binary() {
		return self::is_windows() ? 'npx.cmd' : 'npx';
	}

	/**
	 * Default npm package spec.
	 *
	 * @return string
	 */
	private static function default_npx_package() {
		$package_json = dirname( __DIR__, 2 ) . '/package.json';
		if ( file_exists( $package_json ) ) {
			$package = json_decode( file_get_contents( $package_json ), true );
			if ( is_array( $package ) && ! empty( $package['version'] ) ) {
				return 'pressship@' . $package['version'];
			}
		}

		return 'pressship';
	}

	/**
	 * Isolated npm prefix so npx does not resolve a same-named local workspace.
	 *
	 * @return string
	 */
	private static function npx_prefix_dir() {
		$directory = rtrim( sys_get_temp_dir(), DIRECTORY_SEPARATOR ) . DIRECTORY_SEPARATOR . 'pressship-wp-cli-npx';
		if ( ! is_dir( $directory ) ) {
			mkdir( $directory, 0700, true );
		}

		return $directory;
	}

	/**
	 * Detect Windows without depending on WP-CLI utils.
	 *
	 * @return bool
	 */
	private static function is_windows() {
		return '\\' === DIRECTORY_SEPARATOR;
	}
}
