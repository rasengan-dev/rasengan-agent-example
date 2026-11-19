import { defineConfig } from 'rasengan';
import tailwindcss from '@tailwindcss/vite';
import { rasengan } from 'rasengan/plugin';

export default defineConfig(async () => {
  return {
    // A client app: everything comes from the agent server's API and event stream.
    ssr: false,
    server: {
      development: {
        port: 5300
      }
    },
    vite: {
      plugins: [tailwindcss(), rasengan()],
    },
  };
});
