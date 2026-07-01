FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json turbo.json .
COPY apps/designer/package.json apps/designer/package.json
COPY packages/spec/package.json packages/spec/package.json

RUN npm ci

COPY apps/designer apps/designer
COPY packages/spec packages/spec

EXPOSE 3000
CMD ["npm","-w","@desagi/designer","run","dev"]

