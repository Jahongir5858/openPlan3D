FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
COPY bundle.tar.gz.b64 /tmp/bundle.tar.gz.b64
RUN base64 -d /tmp/bundle.tar.gz.b64 > /tmp/bundle.tar.gz && tar -xzf /tmp/bundle.tar.gz -C /app && rm -f /tmp/bundle.tar.gz /tmp/bundle.tar.gz.b64
RUN npm install --no-audit --no-fund
RUN npx prisma generate
RUN npm run build
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["sh","-c","npx prisma db push --skip-generate && npx prisma db seed && node .next/standalone/server.js"]
