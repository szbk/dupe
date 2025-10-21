FROM node:22-slim
RUN apt-get update && apt-get install -y ffmpeg
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm i
COPY . .
EXPOSE 3001
CMD ["npm","start"]
