# 一鍵在小主機 / VM 上跑 Telegram bot（長輪詢，不需開 port）
# 建置： docker build -t youthinkourfuture-bot .
# 執行： docker run -d --restart unless-stopped --env-file .env.local \
#          --add-host=host.docker.internal:host-gateway youthinkourfuture-bot
# （用 docker compose 更簡單，見 docker-compose.yml）

FROM node:22-slim

WORKDIR /app

# 先裝依賴（含 tsx，用來直接執行 TypeScript）
COPY package.json package-lock.json ./
RUN npm ci

# 再複製原始碼
COPY . .

# bot 走長輪詢，不對外開 port。預設啟動 Telegram bot。
# 若想改跑網頁版，覆寫指令： docker run ... youthinkourfuture-bot npm run build && npm run start （並開 3000 埠）
CMD ["npm", "run", "bot"]
