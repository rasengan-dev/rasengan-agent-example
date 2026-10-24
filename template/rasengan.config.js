import { defineConfig } from 'rasengan';
import tailwindcss from '@tailwindcss/vite';
import { rasengan } from 'rasengan/plugin';

export default defineConfig(async () => {
  return {
    vite: {
      plugins: [tailwindcss(), rasengan()],
      // The agent's site: served on its own port and shown in the dashboard's preview iframe.
      server: {
        host: '0.0.0.0',
        port: 5320,
        strictPort: true,
        allowedHosts: true,
      },
    },
  };
});
