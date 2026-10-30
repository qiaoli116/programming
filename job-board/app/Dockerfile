# One image runs the whole app (T-8): Express serves the API and the built React files.
#   docker build -t job-board .
#   docker run -p 3000:3000 -v job-board-data:/data job-board
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared ./shared
COPY server ./server
COPY web ./web
COPY e2e/package.json ./e2e/package.json
RUN npm ci
RUN npm run build -w web

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DB_FILE=/data/jobboard.sqlite \
    SEED_ON_START=true
COPY --from=build /app /app
VOLUME /data
EXPOSE 3000
WORKDIR /app/server
CMD ["npm", "start"]
