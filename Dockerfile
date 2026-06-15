FROM node:18-alpine

WORKDIR /app

# Create data directory
RUN mkdir -p /data

COPY package.json ./
RUN npm install

COPY . .

# Ensure data directory exists and is writable
RUN mkdir -p /data && chmod 777 /data

EXPOSE 3000

CMD ["node", "server.js"]
