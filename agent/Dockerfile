# Continuity voice agent, for LiveKit Cloud (lk agent create / lk agent deploy).
# LiveKit Cloud provides LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET; the other values come from the secrets file.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
CMD ["node", "agent.mjs", "start"]
