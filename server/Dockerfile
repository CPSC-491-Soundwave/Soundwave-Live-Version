FROM node:22-slim

ARG SOUNDWAVE_BUILD_VERSION=dev

LABEL org.opencontainers.image.title="Soundwave Server"
LABEL org.opencontainers.image.version="${SOUNDWAVE_BUILD_VERSION}"

ENV SOUNDWAVE_BUILD_VERSION="${SOUNDWAVE_BUILD_VERSION}"

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

EXPOSE 8080

CMD ["npm", "start"]