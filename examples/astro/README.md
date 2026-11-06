# Astro example

A small Astro blog with two posts and the "listen to this article" player.

You must have Vois Studio on this computer, with a paid plan or export credits. You must also have Node.js 22 or a newer version (for Astro) and ffmpeg.

```sh
npm install
npm run narrate
npm run build
npm run preview
```

`npm run narrate` speaks the two posts. Type it again: it speaks no post, because no post changed. Then change a sentence in one post and type it again. It speaks only that post.

To see the text that the listener hears, type `npx article-narrator text src/content/blog/first-post.md`.

The audio files go to `public/narration/`, and the manifest goes to `src/data/narration.json`. In this example, Git ignores them. In your site, commit them.
