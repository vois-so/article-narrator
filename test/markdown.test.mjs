import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readHtml } from '../src/html.mjs';
import { readMarkdown, splitFrontMatter } from '../src/markdown.mjs';
import { toSpoken } from '../src/spoken.mjs';

const spoken = (md, opts) => toSpoken(readMarkdown(md, opts), opts).paragraphs;

test('front matter: YAML, TOML and JSON', () => {
  assert.deepEqual(splitFrontMatter('---\ntitle: "Hi: there"\ndraft: true\ntags: [a, b]\n---\nBody').data, { title: 'Hi: there', draft: true, tags: ['a', 'b'] });
  assert.deepEqual(splitFrontMatter('+++\ntitle = "TOML post"\ndraft = false\n[params]\nx = 1\n+++\nBody').data, { title: 'TOML post', draft: false });
  const json = splitFrontMatter('{\n  "title": "JSON post"\n}\nBody');
  assert.equal(json.data.title, 'JSON post');
  assert.equal(json.body, 'Body');
  assert.deepEqual(splitFrontMatter('No front matter').data, {});
});

test('markdown: code, tables, images and links', () => {
  const md = `---
title: Post
---

Intro with ![a picture](a.png) and [a link](https://example.com).

\`\`\`js
const secret = 1;
\`\`\`

| A | B |
|---|---|
| 1 | 2 |

    indented code

Last line.[^1]

[^1]: A footnote.
[ref]: https://example.com
`;
  assert.deepEqual(spoken(md), [
    'Post.',
    'Intro with and a link.',
    'There is a code example on the page.',
    'There is a table on the page.',
    'There is a code example on the page.',
    'Last line.',
  ]);
});

test('markdown: the first heading is not read two times', () => {
  assert.deepEqual(spoken('# My title\n\nText.'), ['My title.', 'Text.']);
  assert.deepEqual(spoken('---\ntitle: My title\n---\n# My title\n\nText.'), ['My title.', 'Text.']);
});

test('markdown: lists, nested items, quotes and alerts', () => {
  const md = 'You need:\n\n- Node.js\n- ffmpeg\n  - on the PATH\n- [x] Vois Studio\n\n> [!NOTE]\n> Keep the app open.';
  assert.deepEqual(spoken(md, { readTitle: false }), [
    'You need.',
    'First, Node.js. Second, ffmpeg. on the PATH. Third, Vois Studio.',
    'Keep the app open.',
  ]);
});

test('markdown: MDX imports, components and expressions', () => {
  const md = "import Chart from './Chart';\nexport const meta = {\n  a: 1,\n};\n\n<Callout type=\"info\">\nRead this {props.name} part.\n</Callout>\n\n<Chart data={[1, 2]} />\n\nEnd.";
  assert.deepEqual(spoken(md, { mdx: true, readTitle: false }), ['Read this part.', 'End.']);
});

test('markdown: Hugo and Docusaurus marks', () => {
  const md = '{{< highlight go >}}\nfmt.Println("x")\n{{< /highlight >}}\n\n{{< figure src="a.png" >}}\n\n:::tip\nA tip.\n:::\n\nText {{< ref "x" >}} here.';
  assert.deepEqual(spoken(md, { readTitle: false }), ['There is a code example on the page.', 'A tip.', 'Text here.']);
});

test('markdown: narrator:off and narrator:on', () => {
  const md = 'Read this.\n\n<!-- narrator:off -->\nNot this.\n<!-- narrator:on -->\n\nAnd this.';
  assert.deepEqual(spoken(md, { readTitle: false }), ['Read this.', 'And this.']);
});

test('html: WordPress content', () => {
  const html = `<p>Hello &amp; welcome. Use <code>npm i</code>.</p>
<!-- wp:code --><pre class="wp-block-code"><code>let x = 1;</code></pre><!-- /wp:code -->
<figure class="wp-block-table"><table><tr><td>a</td></tr></table></figure>
<figure class="wp-block-image"><img src="a.png" alt="A"><figcaption>Caption</figcaption></figure>
<ol><li>One<ul><li>Inner</li></ul></li><li>Two</li></ol>
<p data-narrator="off">Hidden.</p>
<article-narrator src="a.mp3"><audio controls src="a.mp3"></audio></article-narrator>
<p>Bye<br>now.</p>`;
  const doc = readHtml(html, { fragment: true });
  assert.deepEqual(toSpoken({ title: '', blocks: doc.blocks }).paragraphs, [
    'Hello and welcome. Use npm i.',
    'There is a code example on the page.',
    'First, One. Inner. Second, Two.',
    'Bye now.',
  ]);
});

test('html: a full page uses <article> and the h1', () => {
  const html = '<html lang="en"><head><title>Site | Post</title></head><body><nav>Menu</nav><article><h1>Post title</h1><p>Body.</p></article><footer>Footer</footer></body></html>';
  const doc = readHtml(html);
  assert.equal(doc.title, 'Post title');
  assert.equal(doc.data.lang, 'en');
  assert.deepEqual(toSpoken(doc).paragraphs, ['Post title.', 'Body.']);
});
