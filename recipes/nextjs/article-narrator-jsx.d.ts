// Lets TypeScript accept <article-narrator> in JSX. Put this file in the project root.
import type { DetailedHTMLProps, HTMLAttributes } from 'react';

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'article-narrator': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        duration?: number | string;
        label?: string;
      };
    }
  }
}
