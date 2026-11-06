# article-narrator

"Listen to this article" for blogs and documentation sites. A step on your computer speaks each new or changed post with Vois Studio. A small player on the page plays the audio.

Vois Studio is closed source. article-narrator is open source with the MIT license.

## What it does

- It reads your posts. A post can be a Markdown, MDX or HTML file, or a post on a WordPress site.
- It keeps only the prose. It removes code, tables, URLs and images. It writes numbers and symbols as words. These are the rules of the [write-for-voice](https://github.com/vois-so/skills/tree/main/skills/write-for-voice) skill.
- It speaks the text with `vois-cli`. Then it makes one MP3 file for each post with ffmpeg.
- It keeps a content hash for each post in a manifest. The next time, it renders only the new and changed posts.
- The `<article-narrator>` web component shows a small player. It has no dependencies and no tracking.

There is no hosted part. article-narrator does not upload files to a service. You publish the MP3 files with the other files of your site.

## Plans

- For audio files from `vois-cli`, a paid plan of Vois Studio or export credits are necessary.
- For a commercial site, the Pro plan is necessary.
- The Free plan is for personal and non-commercial use. With export credits, the Free plan can make audio files.
- On export credits, each part of the audio uses one credit. A part has 1,900 characters or less. article-narrator stops before it uses credits. To let it use credits, add `--use-credits`.
- [Compare the plans](https://vois.so/pricing?utm_source=github&utm_medium=article-narrator&utm_campaign=oss).

## Before you start

- [Vois Studio](https://vois.so/download?utm_source=github&utm_medium=article-narrator&utm_campaign=oss) on an Apple Silicon Mac or on Windows. Vois Studio must be open, or its service must be on (`vois-cli service start`).
- [Node.js](https://nodejs.org) 18 or a newer version.
- [ffmpeg](https://ffmpeg.org).

## Install

In the folder of your site, type:

```sh
npm install --save-dev github:vois-so/article-narrator
```

If you do not want to install it, type `npx github:vois-so/article-narrator build`.

## Start

1. Make a file with the name `article-narrator.json` in the root folder of your site:

   ```json
   {
     "content": "src/content/blog",
     "out": "public/narration",
     "url": "/narration",
     "manifest": "src/data/narration.json"
   }
   ```

2. Type `npx article-narrator build`. The first time, it speaks all posts. After that, it speaks only the new and changed posts.
3. Add the player to the template of a post. The [recipes](#recipes) show how.
4. Commit the MP3 files and the manifest. The server of your host does not have Vois Studio. Thus it uses the files from your computer.

To see the text that the listener hears, type `npx article-narrator text <file>`. For this command, Vois Studio is not necessary.

## Recipes

| Site tool | Recipe |
| --- | --- |
| Astro | [recipes/astro](recipes/astro/README.md). The [example](examples/astro) is a full Astro site with two posts. |
| Next.js | [recipes/nextjs](recipes/nextjs/README.md) |
| Hugo | [recipes/hugo](recipes/hugo/README.md) |
| WordPress | [recipes/wordpress](recipes/wordpress/README.md). You make the audio on your computer. A small plugin shows the player for the audio file of the post. |

## How it works

1. article-narrator finds the posts in the `content` folder, or it reads the published posts of your WordPress site.
2. It makes the spoken text of each post. Then it calculates a hash of the text, the engine, the voice, the language and the speed.
3. If the manifest has the same hash and the MP3 file is there, the post did not change. article-narrator does not render it again.
4. For a new or changed post, it divides the text into parts. Each part has 1,900 characters or less. `vois-cli tts generate` speaks each part.
5. ffmpeg makes one MP3 file from the parts. It sets the loudness to -16 LUFS. The file is mono, 24 kHz and 64 kbps.
6. article-narrator writes the manifest. If no post changed, it does not write the manifest.

A change to the code or to a table does not render the post again, because the listener does not hear them. A change to the engine, the voice, the language or the speed renders all posts again.

## What the listener hears

- The title of the post, then the text.
- Headings are for the eye. The listener does not hear them. To speak them, set `"headings": true`.
- A code block or a table becomes one short sentence: "There is a code example on the page." To remove these sentences, set `"notices": false`.
- Short inline code, for example `npm install`, stays as words. Long inline code becomes "the code on the page".
- A link becomes its text. A URL becomes "the link on this page". article-narrator removes a URL in parentheses.
- Numbers, money, dates, times and units become words. For example, "$19.99" becomes "nineteen dollars ninety-nine". This applies only to English. For other languages, Vois Studio reads the numbers.
- A list becomes sentences: "First, ... Second, ...".

To stop the narration for a part of a post, put `<!-- narrator:off -->` before it and `<!-- narrator:on -->` after it. In HTML, you can also add `data-narrator="off"` to an element.

article-narrator does not speak a post that has `draft: true` or `narrate: false` in its front matter.

Names and acronyms can have an incorrect pronunciation. Use `"replace"` to write them differently, for example `{ "API": "A P I" }`. You can also add them to the pronunciation dictionary of Vois Studio.

## Configuration

The configuration file is `article-narrator.json`. The paths in it start at the folder of the file.

| Field | Default | What it does |
| --- | --- | --- |
| `content` | none | The folder with your posts. |
| `include` | `**/*.md`, `**/*.mdx`, `**/*.markdown`, `**/*.html` | The files in `content` to read. |
| `exclude` | `**/_*` | The files in `content` to ignore. |
| `wordpress` | none | The address of a WordPress site, as an alternative to `content`. |
| `out` | `narration` | The folder for the MP3 files. |
| `url` | `/narration` | The URL of the `out` folder on your site. |
| `manifest` | `<out>/narration.json` | The manifest file. Your templates read it. |
| `engine` | `sonic` | `sonic`, `fast`, `expressive`, `multilingual`, `omni` or `craft`. For Omni and Craft, Pro is necessary. |
| `voice` | `sonic_cedar` | The voice ID. For an engine that is not Sonic, you must set it. To see the IDs, type `vois-cli voice list --engine <engine>`. |
| `language` | `English` | The language of the posts. |
| `speed` | `1` | From 0.5 to 2. |
| `instruct` | none | A direction in plain words, for example "calm and warm". Only Omni and Craft use it. |
| `bitrate` | `64k` | The MP3 bit rate. |
| `loudness` | `-16` | The loudness in LUFS, or `false` to keep the level of the voice. |
| `maxChars` | `1900` | The maximum length of one part. |
| `readTitle` | `true` | Speak the title first. |
| `headings` | `false` | Speak the headings. |
| `intro`, `outro` | none | A sentence before or after the post. |
| `notices` | English sentences | The sentences for code and tables. `false` removes them. |
| `replace` | none | Words to write differently, for example `{ "API": "A P I" }`. |
| `drafts` | `false` | Also speak draft posts. |

## Commands

| Command | What it does |
| --- | --- |
| `article-narrator build` | Speaks the new and changed posts. Writes the MP3 files and the manifest. |
| `article-narrator status` | Shows the condition of each post. For this command, Vois Studio is not necessary. |
| `article-narrator text <file or ID>` | Shows the spoken text of one post. For this command, Vois Studio is not necessary. |

| Flag | What it does |
| --- | --- |
| `--config <file>` | Use a different configuration file. |
| `--only <ID,ID>` | Render only these posts. |
| `--force` | Render the posts again, also if they did not change. |
| `--dry-run` | Show the posts that article-narrator will render. Do not render them. |
| `--prune` | Delete the MP3 files that have no post at this time. |
| `--use-credits` | Let article-narrator use export credits. |
| `--if-available` | Stop with no error if `vois-cli` is not on this computer or Vois Studio is not open. Use this flag if the server of your host also does this step. |
| `--json` | Write the result as JSON. |

## The player

```html
<article-narrator src="/narration/my-post.mp3" duration="183">
  <audio controls preload="none" src="/narration/my-post.mp3"></audio>
</article-narrator>
<script src="/article-narrator.js" defer></script>
```

The file is [player/article-narrator.js](player/article-narrator.js). With a bundler, import `@vois-so/article-narrator/player`. If JavaScript is off, the browser shows the `<audio>` element.

| Attribute | What it does |
| --- | --- |
| `src` | The URL of the MP3 file. |
| `duration` | The length in seconds. The player shows it before it downloads the audio. |
| `label` | The text above the player. The default is "Listen to this article". An empty value removes it. |
| `play-label`, `pause-label`, `back-label`, `forward-label`, `seek-label`, `speed-label`, `error-label` | The names of the controls, for a site in a different language. |

Privacy:

- The player does not download the audio before the reader selects Play.
- It sets no cookies, and it keeps no data in the browser.
- It does not get files from a different site.

Keyboard:

| Keys | Control | What it does |
| --- | --- | --- |
| The Tab key | All | Moves to the next control. |
| The Space key or the Enter key | Play, Back, Forward, Speed | Operates the control. |
| The Space key or the Enter key | The position slider | Starts or stops the audio. |
| The left arrow key or the right arrow key | The position slider | Moves the position 5 seconds. |
| The Page Up key or the Page Down key | The position slider | Moves the position 30 seconds. |
| The Home key or the End key | The position slider | Moves to the start or to the end. |

Each control has a name for screen readers. The player also shows the title of the page on the lock screen of a phone.

To change the colors, set these CSS properties on `article-narrator`: `--article-narrator-accent`, `--article-narrator-border`, `--article-narrator-background`, `--article-narrator-focus` and `--article-narrator-radius`. You can also change the style of the parts: `player`, `label`, `play`, `back`, `seek`, `forward`, `time`, `speed` and `status`.

## Exit codes

| Exit code | Cause |
| --- | --- |
| 0 | The command completed. |
| 2 | `vois-cli` is not on this computer, or Vois Studio is not open. |
| 3 | A field or a flag is not correct. |
| 4 | The voice is not in Vois Studio. |
| 5 | The generation did not complete. |
| 6 | ffmpeg is not on this computer, or it could not make the MP3 file. |
| 7 | The plan cannot make audio files from `vois-cli`, or article-narrator must have `--use-credits`. |
| 8 | There are not sufficient export credits, or the quota is empty. |

Other codes come from `vois-cli`. To see them, type `vois-cli --help`.

## Problems and ideas

Open an [issue](https://github.com/vois-so/article-narrator/issues). For a problem in Vois Studio, use [vois-so/vois-studio](https://github.com/vois-so/vois-studio/issues).

## License

MIT. See [LICENSE](LICENSE).
