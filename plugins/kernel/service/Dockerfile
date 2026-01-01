FROM node:20-alpine

# Install NATS server
RUN apk add --no-cache curl && \
    curl -L https://github.com/nats-io/nats-server/releases/download/v2.10.24/nats-server-v2.10.24-linux-amd64.tar.gz | tar xz && \
    mv nats-server-*/nats-server /usr/local/bin/ && \
    rm -rf nats-server-* && \
    apk del curl

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy compiled source
COPY dist/ ./dist/

# Copy start script
COPY start.sh ./
RUN chmod +x start.sh

# Create data directory for JetStream
RUN mkdir -p /data

# Expose ports
EXPOSE 4222 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start NATS + Node service
CMD ["./start.sh"]