import { defineConfig } from 'rasengan';
import tailwindcss from '@tailwindcss/vite';
import { rasengan } from 'rasengan/plugin';

export default defineConfig(async () => {
  return {
    // A client app: everything comes from the agent server's API and event stream.
    ssr: false,
    vite: {
      plugins: [tailwindcss(), rasengan()],
      server: { port: 5300, strictPort: true },
    },
  };
});
