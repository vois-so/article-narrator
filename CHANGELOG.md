# Changelog

## 0.1.0

- `article-narrator build` speaks new and changed posts with Vois Studio through `vois-cli`, and writes one MP3 file for each post with ffmpeg.
- The posts can be Markdown, MDX or HTML files, or the published posts of a WordPress site.
- The spoken text keeps only the prose. It removes code, tables, URLs and images, and it writes numbers and symbols as words.
- A content hash for each post in the manifest. The next build renders only the new and changed posts.
- `article-narrator status` and `article-narrator text` show the condition and the spoken text of the posts, without Vois Studio.
- The `<article-narrator>` player: a web component with no dependencies and no tracking, with labelled controls and keyboard support.
- Recipes for Astro, Next.js, Hugo and WordPress, with a plugin for WordPress, and an Astro example with two posts.
