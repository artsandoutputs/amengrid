# 1. Use Node base image
FROM node:18-bullseye-slim

# 2. Install FFmpeg and yt-dlp dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 3. Install yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# 4. Install dependencies
COPY package*.json ./
RUN npm install

# 5. Copy source and build TypeScript to JavaScript
COPY . .
RUN npm run build

# 6. Set Environment Variables for the container
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV YT_DLP_PATH=/usr/local/bin/yt-dlp
ENV NODE_ENV=production

# 7. Start from the compiled 'dist' folder (per your start script)
EXPOSE 3001
CMD ["npm", "start"]