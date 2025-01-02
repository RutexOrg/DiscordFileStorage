FROM node:20.9.0

WORKDIR /app

COPY package.json yarn.lock tsconfig.json ./
COPY src ./src
COPY out ./out
COPY .env ./

RUN yarn install --frozen-lockfile
RUN yarn build

RUN mkdir -p certs
EXPOSE 3000/tcp

ENV NODE_ENV=production

CMD ["yarn", "start"]

VOLUME [ "/app/certs" ]
