FROM node:24-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
RUN git clone --depth 1 --recurse-submodules --shallow-submodules https://github.com/TelegramOrg/Telegram-web-k.git /app
WORKDIR /app
RUN pnpm install --frozen-lockfile
COPY owner-presence.js /app/public/owner-presence.js
COPY inject.mjs /tmp/inject.mjs
RUN node /tmp/inject.mjs /app/index.html
RUN pnpm exec vite build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80