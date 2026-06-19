FROM node:18-alpine

WORKDIR /app

COPY image/package*.json ./
RUN npm ci --omit=dev

COPY image/server.js ./server.js

EXPOSE 7860

CMD ["npm", "start"]
