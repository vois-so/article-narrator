# WordPress

This recipe adds "listen to this article" to a WordPress site. You make the audio on your computer. A small plugin shows the player for the audio file of the post.

article-narrator reads the published posts from the REST API of your site. It reads only public data. It does not upload files, and it does not change your site.

## 1. Make the audio on your computer

Install [Node.js](https://nodejs.org) 18 or a newer version. Then make a folder on your computer with this `article-narrator.json` file:

```json
{
  "wordpress": "https://example.com",
  "out": "narration"
}
```

In that folder, type:

```sh
npx github:vois-so/article-narrator build
```

article-narrator writes one MP3 file for each post, for example `narration/my-post.mp3`. The file name is the slug of the post. The next time, it speaks only the new and changed posts.

To make audio for pages, add `"wordpress": { "site": "https://example.com", "type": "pages" }`.

## 2. Install the plugin

1. Make a ZIP file of the [article-narrator-player](article-narrator-player) folder.
2. In WordPress, go to Plugins, then Add New Plugin, then Upload Plugin. Select the ZIP file.
3. Activate the plugin.

The plugin has two files: the PHP file and the player script. It does not make audio. It sends no data to a different site.

## 3. Add the audio to a post

1. Open the post in the editor.
2. Upload the MP3 file of the post to the Media Library from this post. Then WordPress attaches the file to the post.
3. Add a Shortcode block with `[article_narrator]` where you want the player, usually below the title.
4. Update the post.

The shortcode shows the audio file that is attached to the post. If more than one audio file is attached, it uses the file that starts with the slug of the post. If no file starts with the slug, it uses the newest audio file.

| Shortcode | What it shows |
| --- | --- |
| `[article_narrator]` | The audio file that is attached to the post. |
| `[article_narrator id="123"]` | The audio file that has this ID in the Media Library. |
| `[article_narrator src="https://example.com/a.mp3"]` | The audio file at this URL. |
| `[article_narrator label="Listen"]` | A different text above the player. |

If a post has no audio file, the shortcode shows nothing.

## When you change a post

1. Type `npx github:vois-so/article-narrator build` again. It speaks only the changed posts.
2. Upload the new MP3 file to the post. The shortcode uses the newest file that starts with the slug.
3. You can delete the file that you used before from the Media Library.
