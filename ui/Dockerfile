FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY server.js ./
COPY lib/ ./lib/
COPY public/ ./public/

EXPOSE 3080

CMD ["node", "server.js"]
