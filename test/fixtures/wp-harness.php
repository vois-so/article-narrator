<?php
// Runs the WordPress plugin with small stand-ins for the WordPress functions.
// Prints one JSON object with the shortcode output for each case.

define( 'ABSPATH', __DIR__ . '/' );

$GLOBALS['enqueued'] = array();
$GLOBALS['shortcodes'] = array();
$GLOBALS['current_post'] = null;
$GLOBALS['attachments'] = array();

function add_shortcode( $tag, $callback ) { $GLOBALS['shortcodes'][ $tag ] = $callback; }
function shortcode_atts( $pairs, $atts ) {
	$atts = (array) $atts;
	$out  = array();
	foreach ( $pairs as $name => $default ) {
		$out[ $name ] = array_key_exists( $name, $atts ) ? $atts[ $name ] : $default;
	}
	return $out;
}
function absint( $v ) { return abs( (int) $v ); }
function get_post() { return $GLOBALS['current_post']; }
function get_attached_media( $type, $post_id ) {
	return array_values( array_filter( $GLOBALS['attachments'], function ( $a ) use ( $post_id ) { return $a->post_parent === $post_id; } ) );
}
function get_attached_file( $id ) { return '/uploads/' . $GLOBALS['attachments'][ $id ]->file; }
function wp_get_attachment_url( $id ) { return isset( $GLOBALS['attachments'][ $id ] ) ? 'https://example.com/uploads/' . $GLOBALS['attachments'][ $id ]->file : false; }
function wp_get_attachment_metadata( $id ) { return array( 'length' => $GLOBALS['attachments'][ $id ]->length ); }
function plugins_url( $path, $file ) { return 'https://example.com/plugins/article-narrator-player/' . $path; }
function wp_enqueue_script( $handle, $src ) { $GLOBALS['enqueued'][] = $src; }
function esc_url( $url ) { return preg_match( '#^https?://#', $url ) ? htmlspecialchars( $url, ENT_QUOTES ) : ''; }
function esc_url_raw( $url, $protocols = null ) { return preg_match( '#^https?://#', $url ) ? $url : ''; }
function esc_attr( $v ) { return htmlspecialchars( (string) $v, ENT_QUOTES ); }

require __DIR__ . '/../../recipes/wordpress/article-narrator-player/article-narrator-player.php';

function attachment( $id, $parent, $file, $date, $length ) {
	$GLOBALS['attachments'][ $id ] = (object) array( 'ID' => $id, 'post_parent' => $parent, 'file' => $file, 'post_date_gmt' => $date, 'length' => $length );
}
attachment( 11, 1, 'interview.mp3', '2026-11-05 10:00:00', 600 );
attachment( 12, 1, 'hello-world.mp3', '2026-11-01 10:00:00', 183 );
attachment( 21, 2, 'old.mp3', '2026-10-01 10:00:00', 50 );
attachment( 22, 2, 'new.mp3', '2026-11-01 10:00:00', 60 );

$sc  = $GLOBALS['shortcodes']['article_narrator'];
$out = array( 'registered' => isset( $GLOBALS['shortcodes']['article_narrator'] ) );

$GLOBALS['current_post'] = (object) array( 'ID' => 1, 'post_name' => 'hello-world' );
$out['slug_match'] = $sc( '' );
$GLOBALS['current_post'] = (object) array( 'ID' => 2, 'post_name' => 'other' );
$out['newest']     = $sc( '' );
$out['by_id']      = $sc( array( 'id' => '11', 'label' => 'Listen "now"' ) );
$out['by_src']     = $sc( array( 'src' => 'https://cdn.example.com/a.mp3' ) );
$out['bad_src']    = $sc( array( 'src' => 'javascript:alert(1)' ) );
$GLOBALS['current_post'] = (object) array( 'ID' => 3, 'post_name' => 'none' );
$out['no_audio']   = $sc( '' );
$out['enqueued']   = array_values( array_unique( $GLOBALS['enqueued'] ) );

echo json_encode( $out, JSON_UNESCAPED_SLASHES );
