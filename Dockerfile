FROM node:18-alpine

WORKDIR /app

# Install system deps (su-exec for permission management)
RUN apk add --no-cache su-exec

# Install Node dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source
COPY . .

# Create persistent data and audio directories
RUN mkdir -p /app/data /app/audio

# Expected Docker volume mounts:
#   /app/data   — config.json, history files
#   /app/audio  — ElevenLabs TTS MP3 files (serve via Nginx for public links)

EXPOSE 8085

CMD ["node", "server.js"]
