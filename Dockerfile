# One container: the Futon server (agent + API + built dashboard) and the site's `rasengan dev`.
# The container is the sandbox: the agent only reaches the site through its tools.
FROM node:22-bookworm-slim
RUN corepack enable
WORKDIR /app

# The site the agent edits, with its dependencies baked in so a run never waits on npm.
COPY template/package.json /workspace/site/package.json
RUN cd /workspace/site && npm install --no-audit --no-fund
COPY template/ /workspace/site/

# Server and dashboard.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/
COPY dashboard/package.json dashboard/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter dashboard build

ENV PORT=3000 \
    SITE_DIR=/workspace/site \
    TEMPLATE_DIR=/app/template \
    DASHBOARD_DIR=/app/dashboard/dist

# 3000: dashboard + API · 5320: the site's preview · 6665: its hot reload socket
EXPOSE 3000 5320 6665
CMD ["node", "--import", "tsx", "server/src/index.ts"]
