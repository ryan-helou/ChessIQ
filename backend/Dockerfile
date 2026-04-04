FROM node:20-slim

# Install Stockfish
RUN apt-get update && \
    apt-get install -y stockfish && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Verify Stockfish works
RUN stockfish quit <<< "quit" || true

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
ENV STOCKFISH_PATH=stockfish
ENV PORT=3001

CMD ["node", "dist/server.js"]
