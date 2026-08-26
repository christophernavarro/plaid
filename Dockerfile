FROM node:20-alpine AS builder

WORKDIR /app

# Install client dependencies and build
COPY client/package.json client/package-lock.json ./client/
RUN cd client && npm ci

COPY client/ ./client/
RUN cd client && npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Install server dependencies
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# Copy server code
COPY server/ ./server/

# Copy built client
COPY --from=builder /app/client/dist ./client/dist

EXPOSE 8080

CMD ["node", "server/index.js"]
