FROM node:20-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install --registry=https://registry.npmmirror.com
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/main.js"]
