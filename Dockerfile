FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM ubuntu:24.04

# TeX Live (日本語・中国語・欧州言語・数式対応)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    texlive-luatex \
    texlive-lang-japanese \
    texlive-lang-chinese \
    texlive-lang-european \
    texlive-fonts-recommended \
    texlive-fonts-extra \
    texlive-latex-extra \
    texlive-science \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/.next        ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public       ./public
COPY --from=builder /app/server.js    ./server.js

RUN mkdir -p /data/projects
ENV LATEX_BIN_DIR=/usr/bin
ENV PROJECTS_DIR=/data/projects
ENV NODE_ENV=production

EXPOSE 3000
CMD ["node", "server.js"]
