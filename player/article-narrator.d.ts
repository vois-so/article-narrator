// Types for the <article-narrator> element.
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Vois Studio

export interface ArticleNarratorElement extends HTMLElement {
  /** The URL of the audio file. */
  src: string;
  /** The length in seconds. The player shows it before the audio loads. */
  duration: number;
  readonly paused: boolean;
  play(): Promise<void> | undefined;
  pause(): void;
  toggle(): void;
  seekTo(seconds: number): void;
  skip(seconds: number): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'article-narrator': ArticleNarratorElement;
  }
}
