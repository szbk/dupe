# Build client
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci || npm i
COPY client .
RUN npm run build

# Build server
FROM node:22-slim
RUN apt-get update && apt-get install -y ffmpeg
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci || npm i
COPY server .

# Move files to public folder
COPY --from=client /app/client/dist ./public

EXPOSE 3001
CMD ["npm", "start"]
