FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY platform/cli/package.json ./platform/cli/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node apps/api ./apps/api
WORKDIR /workspace/apps/api
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]