FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN mkdir -p public && npm run build
FROM node:22-bookworm-slim AS runtime
LABEL "language"="nodejs"
LABEL "framework"="next.js"
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 DATABASE_PATH=/data/app.sqlite
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/assets ./assets
COPY --from=build /app/migrations ./migrations
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node","server.js"]
