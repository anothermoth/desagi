FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json turbo.json .
COPY apps/runtime/package.json apps/runtime/package.json
COPY packages/spec/package.json packages/spec/package.json

RUN npm ci

COPY apps/runtime apps/runtime
COPY packages/spec packages/spec

EXPOSE 3001
CMD ["npm","-w","@desagi/runtime","run","dev"]

