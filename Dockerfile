FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
RUN mkdir -p logs && chown -R node:node /app

ENV NODE_ENV=production
EXPOSE 4000

USER node
CMD ["node", "index.js"]
