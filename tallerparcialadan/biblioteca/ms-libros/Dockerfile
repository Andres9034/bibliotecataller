# Factor V: build -> release -> run. La imagen no contiene secretos.
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js ./
ENV NODE_ENV=production
EXPOSE 8001
USER node
CMD ["node", "server.js"]
