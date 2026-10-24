// Same as `rasengan build`, which runs `vite build --app` with Rasengan's Vite config.
// With `ssr: false`, rasengan 2.0.0's build finishes writing dist/ but the process never
// exits (an open handle after "Detected deployment platform"), which would hang a Docker
// build. We run the same build through Vite's API and exit when it is done.
import { createBuilder } from 'vite';

process.env.NODE_ENV = 'production';
const builder = await createBuilder({ configFile: './node_modules/rasengan/vite.config.ts', mode: 'production' });
await builder.buildApp();
process.exit(0);
