'use client';

// Shows the "listen to this article" player. Put this file in components/.
import { useEffect } from 'react';

export default function NarrationPlayer({ src, duration }: { src: string; duration?: number }) {
  useEffect(() => {
    import('@vois-so/article-narrator/player');
  }, []);

  return (
    <article-narrator src={src} duration={duration}>
      <audio controls preload="none" src={src} />
    </article-narrator>
  );
}
