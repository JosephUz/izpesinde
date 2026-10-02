# İz Peşinde: tek oyunculu, yalnızca statik dosyalar (sunucu three.js'i node_modules'tan verir). Derleme adımı yok.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Bağımlılıklar önce: kaynak değişince bu katman önbellekten gelir.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY server.mjs game.js index.html style.css ./
COPY src ./src

ENV HOST=0.0.0.0 PORT=5197
EXPOSE 5197
USER node

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5197/health >/dev/null || exit 1

CMD ["node", "server.mjs"]
