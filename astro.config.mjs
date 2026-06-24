import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import tailwind from '@astrojs/tailwind';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// Static-only output. No SSR, no adapters, no server runtime.
// `astro build` -> dist/ of plain HTML/CSS/JS, deployable to any CDN.
export default defineConfig({
  output: 'static',
  site: 'https://how-llms-work.pages.dev',
  integrations: [
    react(),
    tailwind({ applyBaseStyles: false }),
    mdx(),
  ],
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
    shikiConfig: {
      theme: 'github-dark-default',
      wrap: false,
    },
  },
  vite: {
    ssr: {
      // framer-motion ships ESM that Astro's MDX/React pipeline handles fine,
      // but keep it noExternal so it bundles into the island chunks cleanly.
      noExternal: ['framer-motion'],
    },
  },
});
