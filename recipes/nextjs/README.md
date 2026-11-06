# Next.js

This recipe adds "listen to this article" to a Next.js blog with the App Router. The posts are Markdown or MDX files in `content/posts/`.

## 1. Install

```sh
npm install --save-dev github:vois-so/article-narrator
```

## 2. Make the configuration file

Copy [article-narrator.json](article-narrator.json) to the root folder of the site:

```json
{
  "content": "content/posts",
  "out": "public/narration",
  "url": "/narration",
  "manifest": "content/narration.json"
}
```

Add a script to `package.json`:

```json
"scripts": {
  "narrate": "article-narrator build"
}
```

## 3. Add the files

| Copy this file | To this folder |
| --- | --- |
| [NarrationPlayer.tsx](NarrationPlayer.tsx) | `components/` |
| [narration.ts](narration.ts) | `lib/` |
| [article-narrator-jsx.d.ts](article-narrator-jsx.d.ts) | The root folder. It lets TypeScript accept the `<article-narrator>` element. |

`NarrationPlayer` is a client component. It gets the player script after the page loads. `getNarration` reads the manifest on the server.

## 4. Use them in the post page

```tsx
// app/blog/[slug]/page.tsx
import NarrationPlayer from '@/components/NarrationPlayer';
import { getNarration } from '@/lib/narration';

export default async function Post({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const audio = getNarration(slug);
  return (
    <article>
      {/* the title */}
      {audio && <NarrationPlayer src={audio.src} duration={audio.duration} />}
      {/* the post */}
    </article>
  );
}
```

The ID of a post is its file name without `.md` or `.mdx`, for example `my-post`. For a post in a folder, the ID is the path, for example `guides/my-post`.

## 5. Speak the posts

```sh
npm run narrate
npm run build
```

Commit the files in `public/narration/` and `content/narration.json`. The next `npm run narrate` speaks only the new and changed posts.
