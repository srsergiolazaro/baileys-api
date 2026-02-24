# Stage 1: Build
FROM node:20-alpine AS builder

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy configuration files
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/
COPY patches ./patches/

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client and Build the project
RUN pnpm prisma generate
RUN pnpm run build

# Stage 2: Production
FROM node:20-alpine AS runner

WORKDIR /app

# Install pnpm for production install
RUN npm install -g pnpm

# Set environment to production
ENV NODE_ENV=production

# Copy built assets and necessary files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/patches ./patches

# Install ONLY production dependencies
RUN pnpm install --prod --frozen-lockfile

# Generate Prisma client again to ensure it's available in node_modules
RUN pnpm prisma generate

# Expose the API port
EXPOSE 3000

# Start the application
CMD ["pnpm", "start"]
