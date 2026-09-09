# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS frontend-build
WORKDIR /app

RUN corepack enable
RUN pnpm config set dangerouslyAllowAllBuilds true

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY index.html ./
COPY public ./public
COPY src ./src
COPY components.json ./
COPY eslint.config.js ./
COPY postcss.config.js ./
COPY tailwind.config.js ./
COPY tsconfig.app.json ./
COPY tsconfig.json ./
COPY tsconfig.node.json ./
COPY vite.config.ts ./

RUN pnpm build

FROM node:24-alpine AS runtime-deps
WORKDIR /app

RUN corepack enable
RUN pnpm config set dangerouslyAllowAllBuilds true

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM node:24-alpine AS runtime
WORKDIR /app

RUN printf '%s\n' \
      http://dl-cdn.alpinelinux.org/alpine/v3.23/main \
      http://dl-cdn.alpinelinux.org/alpine/v3.23/community \
      > /etc/apk/repositories \
  && apk add --no-cache --allow-untrusted \
      curl \
      font-liberation \
      font-noto \
      font-noto-cjk \
      libreoffice \
      nginx \
      poppler-utils \
      sqlite \
      tini \
      ttf-dejavu

COPY --from=runtime-deps /app/node_modules ./node_modules
COPY package.json ./package.json
COPY scripts ./scripts
COPY docker ./docker
COPY pb_hooks /opt/pocketbase/pb_hooks
COPY --from=frontend-build /app/dist /usr/share/nginx/html
COPY --from=pocketbase-dist /pocketbase /opt/pocketbase/pocketbase
COPY --from=pocketbase-dist /CHANGELOG.md /opt/pocketbase/CHANGELOG.md
COPY --from=pocketbase-dist /LICENSE.md /opt/pocketbase/LICENSE.md

RUN chmod +x /app/docker/entrypoint.sh /opt/pocketbase/pocketbase \
  && mkdir -p /run/nginx /var/lib/nginx/tmp/client_body /pb_data /opt/pocketbase/pb_migrations \
  && rm -f /etc/nginx/http.d/default.conf

COPY docker/nginx.conf /etc/nginx/http.d/default.conf

EXPOSE 8080 8090

VOLUME ["/pb_data"]

ENTRYPOINT ["/sbin/tini", "--", "/app/docker/entrypoint.sh"]
