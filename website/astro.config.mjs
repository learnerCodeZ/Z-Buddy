// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages 项目页：https://learnercodez.github.io/Z-Buddy/
export default defineConfig({
  site: 'https://learnercodez.github.io',
  base: '/Z-Buddy',
  trailingSlash: 'ignore',
  vite: {
    plugins: [tailwindcss()],
  },
});
