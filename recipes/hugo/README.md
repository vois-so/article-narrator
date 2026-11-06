# Hugo

This recipe adds "listen to this article" to a Hugo site. Hugo does not use Node.js. article-narrator is a different step on your computer, before `hugo`.

## 1. Install

Install [Node.js](https://nodejs.org) 18 or a newer version. It is not necessary to install article-narrator. `npx` gets it.

## 2. Make the configuration file

Copy [article-narrator.json](article-narrator.json) to the root folder of the site:

```json
{
  "content": "content",
  "include": ["posts/**/*.md"],
  "out": "static/narration",
  "url": "/narration",
  "manifest": "data/narration.json"
}
```

Hugo reads `data/narration.json` as `site.Data.narration`. Change `include` to the sections of your site. article-narrator reads YAML, TOML and JSON front matter.

## 3. Add the player

1. Copy [player/article-narrator.js](../../player/article-narrator.js) to `static/js/`.
2. Copy [layouts/partials/narration.html](layouts/partials/narration.html) to `layouts/partials/`.
3. Put `narration.html` in the template of a single page, below the title:

   ```go-html-template
   <h1>{{ .Title }}</h1>
   {{ partial "narration.html" . }}
   {{ .Content }}
   ```

`narration.html` finds the audio from the path of the page file. For `content/posts/my-post.md`, the ID is `posts/my-post`. For a page bundle, `content/posts/my-post/index.md`, the ID is also `posts/my-post`. If a page has no audio, `narration.html` shows nothing.

## 4. Speak the posts

```sh
npx github:vois-so/article-narrator build
hugo
```

Commit the files in `static/narration/` and `data/narration.json`. The next time, article-narrator speaks only the new and changed posts.
