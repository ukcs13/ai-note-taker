FROM node:18-alpine

WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY src/backend/package.json ./src/backend/

RUN npm install

COPY src/backend ./src/backend
# In production, we don't copy .env usually, but use environment variables
# For this setup, we'll assume env vars are passed via docker-compose

WORKDIR /app/src/backend

RUN npx prisma generate
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
