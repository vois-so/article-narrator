<?php
/**
 * Plugin Name:       Article Narrator Player
 * Plugin URI:        https://github.com/vois-so/article-narrator
 * Description:       Shows a small "listen to this article" player for the audio file that is attached to a post. Add the [article_narrator] shortcode to the post.
 * Version:           0.1.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Vois Studio
 * License:           MIT
 * License URI:       https://opensource.org/license/mit
 *
 * The audio file is made on your computer with article-narrator and Vois
 * Studio. This plugin only shows the player. It does not make audio, and it
 * sends no data to a different site.
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Vois Studio
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const ARTICLE_NARRATOR_PLAYER_VERSION = '0.1.0';

/**
 * Finds the audio attachment of a post. An attachment whose file name starts
 * with the post slug comes first. Then the newest audio attachment.
 *
 * @param WP_Post $post The post.
 * @return int The attachment ID, or 0.
 */
function article_narrator_player_find_audio( $post ) {
	$media = get_attached_media( 'audio', $post->ID );
	if ( empty( $media ) ) {
		return 0;
	}
	usort(
		$media,
		static function ( $a, $b ) {
			return strcmp( $b->post_date_gmt, $a->post_date_gmt );
		}
	);
	foreach ( $media as $attachment ) {
		$file = basename( (string) get_attached_file( $attachment->ID ) );
		if ( '' !== $post->post_name && 0 === strpos( $file, $post->post_name ) ) {
			return (int) $attachment->ID;
		}
	}
	return (int) $media[0]->ID;
}

/**
 * The [article_narrator] shortcode.
 *
 * Attributes (all optional):
 *   id    The ID of an audio attachment.
 *   src   The URL of an audio file.
 *   label The text above the player. The default is "Listen to this article".
 *
 * Without id and src, the shortcode uses the audio file that is attached to
 * the post.
 *
 * @param array|string $atts The shortcode attributes.
 * @return string The HTML of the player, or an empty string.
 */
function article_narrator_player_shortcode( $atts ) {
	$atts = shortcode_atts(
		array(
			'id'    => '',
			'src'   => '',
			'label' => '',
		),
		$atts,
		'article_narrator'
	);

	$attachment_id = absint( $atts['id'] );
	$url           = '';
	if ( $attachment_id ) {
		$url = (string) wp_get_attachment_url( $attachment_id );
	} elseif ( '' !== $atts['src'] ) {
		$url = esc_url_raw( $atts['src'], array( 'http', 'https' ) );
	} else {
		$post = get_post();
		if ( $post ) {
			$attachment_id = article_narrator_player_find_audio( $post );
			$url           = $attachment_id ? (string) wp_get_attachment_url( $attachment_id ) : '';
		}
	}
	if ( '' === $url ) {
		return '';
	}

	$duration = '';
	if ( $attachment_id ) {
		$meta = wp_get_attachment_metadata( $attachment_id );
		if ( is_array( $meta ) && ! empty( $meta['length'] ) ) {
			$duration = (string) absint( $meta['length'] );
		}
	}

	wp_enqueue_script(
		'article-narrator-player',
		plugins_url( 'article-narrator.js', __FILE__ ),
		array(),
		ARTICLE_NARRATOR_PLAYER_VERSION,
		array(
			'in_footer' => true,
			'strategy'  => 'defer',
		)
	);

	$attributes = sprintf( ' src="%s"', esc_url( $url ) );
	if ( '' !== $duration ) {
		$attributes .= sprintf( ' duration="%s"', esc_attr( $duration ) );
	}
	if ( '' !== $atts['label'] ) {
		$attributes .= sprintf( ' label="%s"', esc_attr( $atts['label'] ) );
	}

	return sprintf(
		'<article-narrator%1$s><audio controls preload="none" src="%2$s"></audio></article-narrator>',
		$attributes,
		esc_url( $url )
	);
}
add_shortcode( 'article_narrator', 'article_narrator_player_shortcode' );
