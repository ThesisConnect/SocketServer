FROM node:18.16.0-alpine

WORKDIR /app

EXPOSE ${PORT}

COPY package.json /app

RUN npm install

COPY . /app

CMD npm run build && npm run start