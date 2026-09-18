FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
# Without the openssl package, Prisma's engine can't detect the OpenSSL
# version on Alpine and silently defaults to the wrong (1.1.x) engine,
# which then fails to load at runtime.
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Without this, the container defaults to UTC (Alpine ships no
# /etc/localtime), so a "9:30" typed by an admin in France on a
# datetime-local input gets stored as 9:30 UTC and then displays 2h later
# (CEST) than what was typed. tzdata is required for musl libc to actually
# resolve a named zone — setting TZ alone silently falls back to UTC.
RUN apk add --no-cache tzdata
ENV TZ=Europe/Paris
RUN apk add --no-cache openssl
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
# prisma/seed.ts imports from ../lib at runtime via tsx (it isn't bundled
# by `next build`), so lib/ needs to exist in the runner image too.
COPY --from=builder /app/lib ./lib
EXPOSE 3000
CMD ["npm", "run", "start"]
