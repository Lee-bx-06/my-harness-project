FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY bin ./bin
COPY scripts ./scripts
COPY src ./src
COPY tests ./tests

RUN npm run build

FROM node:20-bookworm-slim

ENV NODE_ENV=production

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/bin ./bin

RUN useradd --create-home --shell /bin/bash agent \
  && chown -R agent:agent /workspace

USER agent

ENTRYPOINT ["node", "/workspace/dist/src/cli/index.js"]
CMD ["--help"]
