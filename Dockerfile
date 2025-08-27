# Use an official Node.js runtime as a parent image
FROM node:20-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and pnpm-lock.yaml to the working directory
COPY package.json pnpm-lock.yaml ./

# Copy prisma schema
COPY prisma ./prisma

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the application's source code from the host to the image's filesystem
COPY . .

# Build the project
RUN pnpm run build

# Make port 3000 available to the world outside this container
EXPOSE 3000

# Define the command to run the app
CMD [ "pnpm", "start" ]
