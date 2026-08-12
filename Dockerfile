FROM node:22-slim AS build
WORKDIR /app

COPY package.json ./
COPY server/package.json server/package.json
COPY webapp/package.json webapp/package.json
RUN npm install

COPY . .
RUN npm run build

FROM node:22-slim
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
