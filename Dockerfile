FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
COPY migrations ./migrations
RUN npm run build

FROM build AS test
COPY test ./test
COPY jest.config.js ./jest.config.js
CMD ["npm", "run", "test:e2e"]

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
USER node
EXPOSE 3000
CMD ["node", "dist/main"]
