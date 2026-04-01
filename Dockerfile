FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM ubuntu:24.04
RUN apt-get update && apt-get install -y \
    curl \
    texlive-luatex \
    texlive-lang-japanese \
    texlive-fonts-recommended \
    texlive-latex-extra \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public

RUN mkdir -p /app/projects
ENV LATEX_BIN_DIR=/usr/bin
ENV NODE_ENV=production

EXPOSE 3000
CMD ["npm", "start"]
