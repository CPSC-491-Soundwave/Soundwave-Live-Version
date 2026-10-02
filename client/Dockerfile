FROM node:22-alpine

ARG SOUNDWAVE_BUILD_VERSION=dev

LABEL org.opencontainers.image.title="Soundwave Client"
LABEL org.opencontainers.image.version="${SOUNDWAVE_BUILD_VERSION}"

ENV SOUNDWAVE_BUILD_VERSION="${SOUNDWAVE_BUILD_VERSION}"

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]