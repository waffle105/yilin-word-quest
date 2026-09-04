FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
RUN ./node_modules/.bin/vinext build

EXPOSE 3000
CMD ["npm", "run", "start"]
