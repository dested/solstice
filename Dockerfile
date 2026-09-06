FROM oven/bun:1.3 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.3 AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=2567 SOLSTICE_SERVICE=game
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/bots ./bots
USER bun
EXPOSE 2567
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s CMD bun -e 'const r=await fetch(`http://localhost:${process.env.PORT}/healthz`);process.exit(r.ok?0:1)'
CMD ["sh", "-c", "if [ \"$SOLSTICE_SERVICE\" = bots ]; then exec bun bots/index.ts; else exec bun server/index.ts; fi"]
