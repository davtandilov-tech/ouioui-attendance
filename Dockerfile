FROM node:22-slim AS build
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY webapp/package.json webapp/package.json
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json ./
COPY --from=build /app/server/package.json server/package.json
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/prisma server/prisma
COPY --from=build /app/webapp/dist webapp/dist
COPY --from=build /app/node_modules node_modules

WORKDIR /app/server
EXPOSE 3000
CMD ["npm", "run", "start"]
