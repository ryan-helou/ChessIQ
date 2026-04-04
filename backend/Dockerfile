FROM node:20-slim

# Install Stockfish
RUN apt-get update && \
    apt-get install -y stockfish && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Find and verify Stockfish binary
RUN which stockfish && stockfish --help || true
RUN ln -sf $(which stockfish || echo "/usr/games/stockfish") /usr/local/bin/stockfish

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3001

ENV NODE_ENV=production
ENV STOCKFISH_PATH=/usr/games/stockfish
ENV PORT=3001

CMD ["node", "dist/server.js"]
