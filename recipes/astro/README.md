# Astro

This recipe adds "listen to this article" to an Astro blog with a content collection. The [example](../../examples/astro) is a full site with two posts.

## 1. Install

```sh
npm install --save-dev github:vois-so/article-narrator
```

## 2. Make the configuration file

Put `article-narrator.json` in the root folder of the site:

```json
{
  "content": "src/content/blog",
  "out": "public/narration",
  "url": "/narration",
  "manifest": "src/data/narration.json"
}
```

Add a script to `package.json`:

```json
"scripts": {
  "narrate": "article-narrator build"
}
```

## 3. Add the component

Copy [Narration.astro](Narration.astro) to `src/components/`. Then put it in the template of a post, below the title:

```astro
---
import Narration from '../../components/Narration.astro';
// ...
---
<h1>{post.data.title}</h1>
<Narration id={post.id} />
<Content />
```

The component reads `src/data/narration.json`. If a post has no audio, the component shows nothing. Astro adds the player script to the pages with the component.

The ID of the post in Astro is the file name without `.md`, for example `my-post`. article-narrator uses the same ID. For a post in a folder, the ID is the path, for example `2026/my-post`. If you use a `generateId` function in the collection, give the same ID to the component.

## 4. Speak the posts

```sh
npm run narrate
npm run build
```

Commit the files in `public/narration/` and `src/data/narration.json`. The next `npm run narrate` speaks only the new and changed posts.
