FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
ENV NODE_ENV=production
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "src/server.js"]
