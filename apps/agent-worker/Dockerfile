# Node 24 runs TypeScript directly (type stripping), so there is no build step
# and no dependencies to install.
FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
CMD ["node", "src/server.ts"]
