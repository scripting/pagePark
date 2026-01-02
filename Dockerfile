FROM node:8.6.0

WORKDIR /usr/src/app

COPY package.json .
COPY pagepark.js .

RUN mkdir /usr/src/app/domains
RUN mkdir /usr/src/app/prefs

RUN npm install

EXPOSE 1339

CMD ["node", "pagepark.js"]



