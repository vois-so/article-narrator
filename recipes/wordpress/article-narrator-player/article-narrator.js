/*
 * <article-narrator>: a small audio player for "listen to this article".
 * https://github.com/vois-so/article-narrator
 *
 * No dependencies and no tracking. The player sends no request until the
 * reader selects Play, sets no cookies and keeps no data in the browser.
 *
 *   <article-narrator src="/narration/my-post.mp3" duration="183">
 *     <audio controls preload="none" src="/narration/my-post.mp3"></audio>
 *   </article-narrator>
 *
 * The <audio> element inside is the fallback for browsers without JavaScript.
 *
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Vois Studio
 */
(() => {
  if (typeof window === 'undefined' || !window.customElements || window.customElements.get('article-narrator')) return;

  const LABELS = {
    label: 'Listen to this article',
    'play-label': 'Play',
    'pause-label': 'Pause',
    'back-label': 'Back 15 seconds',
    'forward-label': 'Forward 15 seconds',
    'seek-label': 'Position',
    'speed-label': 'Playback speed',
    'error-label': 'The audio cannot play.',
  };
  const SPEEDS = [1, 1.25, 1.5, 1.75, 2, 0.75];
  const STEP = 15;

  const ICONS = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 5h3.5v14H7zm6.5 0H17v14h-3.5z"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5V2L7.5 6 12 10V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/><text x="12" y="16.5" text-anchor="middle">15</text></svg>',
    forward: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5V2l4.5 4L12 10V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z"/><text x="12" y="16.5" text-anchor="middle">15</text></svg>',
  };

  const STYLE = `
    :host { display: block; margin: 1.25em 0; color: inherit; font: inherit; max-width: 42rem; }
    :host([hidden]) { display: none; }
    .player { display: grid; gap: .35rem; padding: .6rem .75rem;
      border: 1px solid var(--article-narrator-border, rgba(127, 127, 127, .45));
      border-radius: var(--article-narrator-radius, .6rem);
      background: var(--article-narrator-background, transparent); }
    .label { margin: 0; font-size: .9em; font-weight: 600; }
    .row { display: flex; align-items: center; gap: .4rem; flex-wrap: wrap; }
    button { display: inline-flex; align-items: center; justify-content: center; min-width: 2.5rem; min-height: 2.5rem;
      padding: 0 .5rem; border: 1px solid transparent; border-radius: 999px; background: none; color: inherit;
      font: inherit; font-size: .85em; cursor: pointer; }
    button:hover { border-color: var(--article-narrator-border, rgba(127, 127, 127, .45)); }
    button.play { border-color: var(--article-narrator-accent, currentColor); }
    button.play svg { fill: var(--article-narrator-accent, currentColor); }
    button:focus-visible, input:focus-visible { outline: 2px solid var(--article-narrator-focus, currentColor); outline-offset: 2px; }
    button:disabled, input:disabled { opacity: .5; cursor: default; }
    svg { width: 1.4rem; height: 1.4rem; fill: currentColor; }
    svg text { font: 700 6.5px/1 system-ui, sans-serif; fill: currentColor; }
    input[type=range] { flex: 1 1 8rem; min-width: 6rem; min-height: 2.5rem; margin: 0;
      accent-color: var(--article-narrator-accent, currentColor); background: transparent; cursor: pointer; }
    .time { font-size: .85em; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .speed { min-width: 3.25rem; font-variant-numeric: tabular-nums; }
    .status { margin: 0; font-size: .85em; }
    .status:empty { display: none; }
    @media (forced-colors: active) {
      button.play { border-color: ButtonText; }
      button.play svg { fill: ButtonText; }
    }
  `;

  function clock(s) {
    if (!Number.isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  }

  function spoken(s) {
    if (!Number.isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    const parts = [];
    if (m) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`);
    if (sec || !m) parts.push(`${sec} ${sec === 1 ? 'second' : 'seconds'}`);
    return parts.join(' ');
  }

  class ArticleNarrator extends HTMLElement {
    static get observedAttributes() {
      return ['src', 'duration', ...Object.keys(LABELS)];
    }

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${STYLE}</style>
        <div class="player" part="player" role="group">
          <p class="label" part="label"></p>
          <div class="row">
            <button type="button" class="play" part="play">${ICONS.play}</button>
            <button type="button" class="back" part="back">${ICONS.back}</button>
            <input type="range" class="seek" part="seek" min="0" max="0" step="1" value="0">
            <button type="button" class="forward" part="forward">${ICONS.forward}</button>
            <span class="time" part="time" aria-hidden="true"></span>
            <button type="button" class="speed" part="speed">1×</button>
          </div>
          <p class="status" part="status" role="status"></p>
        </div>`;
      this.$ = (sel) => root.querySelector(sel);
      this.audio = document.createElement('audio');
      this.audio.preload = 'none';
      this.rate = 1;
      this.seeking = false;

      this.$('.play').addEventListener('click', () => this.toggle());
      this.$('.back').addEventListener('click', () => this.skip(-STEP));
      this.$('.forward').addEventListener('click', () => this.skip(STEP));
      this.$('.speed').addEventListener('click', () => this.nextSpeed());
      const seek = this.$('.seek');
      seek.addEventListener('input', () => {
        this.seeking = true;
        this.seekTo(Number(seek.value));
      });
      seek.addEventListener('change', () => {
        this.seeking = false;
      });
      seek.addEventListener('keydown', (e) => this.seekKey(e));

      const a = this.audio;
      a.addEventListener('play', () => this.onPlay());
      a.addEventListener('pause', () => this.render());
      a.addEventListener('ended', () => this.render());
      a.addEventListener('timeupdate', () => this.render());
      a.addEventListener('durationchange', () => this.render());
      a.addEventListener('loadedmetadata', () => this.render());
      a.addEventListener('error', () => this.onError());
    }

    // Properties reflect the attributes, so frameworks can set either.
    get src() { return this.getAttribute('src') || ''; }
    set src(v) { this.setAttribute('src', v); }
    get duration() { return Number(this.getAttribute('duration')) || 0; }
    set duration(v) { this.setAttribute('duration', String(v)); }
    get paused() { return this.audio.paused; }

    text(name) {
      const v = this.getAttribute(name);
      return v === null ? LABELS[name] : v;
    }

    connectedCallback() {
      this.update();
    }

    disconnectedCallback() {
      this.audio.pause();
    }

    attributeChangedCallback(name, oldValue, value) {
      if (name === 'src' && oldValue !== value && this.audio.getAttribute('src')) {
        this.audio.pause();
        this.audio.removeAttribute('src');
        this.audio.load();
      }
      this.update();
    }

    update() {
      const label = this.text('label');
      const group = this.$('.player');
      this.$('.label').textContent = label;
      this.$('.label').hidden = !label;
      group.setAttribute('aria-label', label || LABELS.label);
      this.$('.back').setAttribute('aria-label', this.text('back-label'));
      this.$('.forward').setAttribute('aria-label', this.text('forward-label'));
      this.$('.seek').setAttribute('aria-label', this.text('seek-label'));
      this.hidden = !this.src;
      this.render();
    }

    total() {
      const d = this.audio.duration;
      return Number.isFinite(d) && d > 0 ? d : this.duration;
    }

    render() {
      const a = this.audio;
      const total = this.total();
      const now = a.currentTime || 0;
      const playing = !a.paused && !a.ended;
      const play = this.$('.play');
      if (this.playing !== playing || !play.hasAttribute('aria-label')) {
        this.playing = playing;
        play.innerHTML = playing ? ICONS.pause : ICONS.play;
      }
      play.setAttribute('aria-label', this.text(playing ? 'pause-label' : 'play-label'));
      const seek = this.$('.seek');
      seek.max = String(Math.ceil(total) || 0);
      if (!this.seeking) seek.value = String(Math.floor(now));
      seek.setAttribute('aria-valuetext', total ? `${spoken(now)} of ${spoken(total)}` : spoken(now));
      this.$('.time').textContent = total ? `${clock(now)} / ${clock(total)}` : clock(now);
      const speed = this.$('.speed');
      speed.textContent = `${this.rate}×`;
      speed.setAttribute('aria-label', `${this.text('speed-label')}: ${this.rate}`);
      for (const b of [this.$('.back'), this.$('.forward'), seek]) b.disabled = !total && !a.currentSrc;
    }

    load() {
      if (!this.audio.getAttribute('src') && this.src) {
        this.audio.src = this.src;
        this.$('.status').textContent = '';
      }
    }

    play() {
      this.load();
      this.audio.playbackRate = this.rate;
      const p = this.audio.play();
      if (p && p.catch) p.catch((err) => {
        if (err && err.name !== 'AbortError' && err.name !== 'NotAllowedError') this.onError();
      });
      return p;
    }

    pause() {
      this.audio.pause();
    }

    toggle() {
      if (this.audio.paused || this.audio.ended) this.play();
      else this.pause();
    }

    seekTo(t) {
      this.load();
      const total = this.total();
      this.audio.currentTime = Math.max(0, total ? Math.min(t, total) : t);
      this.render();
    }

    skip(delta) {
      this.seekTo((this.audio.currentTime || 0) + delta);
    }

    seekKey(e) {
      const step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -30, PageUp: 30 }[e.key];
      if (step !== undefined) {
        e.preventDefault();
        this.skip(step);
      } else if (e.key === 'Home') {
        e.preventDefault();
        this.seekTo(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        this.seekTo(this.total());
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        this.toggle();
      }
    }

    nextSpeed() {
      this.rate = SPEEDS[(SPEEDS.indexOf(this.rate) + 1) % SPEEDS.length];
      this.audio.playbackRate = this.rate;
      this.render();
    }

    onPlay() {
      // Only one player plays at a time.
      for (const other of document.querySelectorAll('article-narrator')) {
        if (other !== this && typeof other.pause === 'function') other.pause();
      }
      const ms = navigator.mediaSession;
      if (ms && typeof window.MediaMetadata === 'function') {
        ms.metadata = new window.MediaMetadata({ title: document.title });
        const handlers = {
          play: () => this.play(),
          pause: () => this.pause(),
          seekbackward: () => this.skip(-STEP),
          seekforward: () => this.skip(STEP),
        };
        for (const [action, fn] of Object.entries(handlers)) {
          try { ms.setActionHandler(action, fn); } catch (err) { /* not supported */ }
        }
      }
      this.render();
    }

    onError() {
      this.$('.status').textContent = this.text('error-label');
      this.render();
    }
  }

  window.customElements.define('article-narrator', ArticleNarrator);
})();
