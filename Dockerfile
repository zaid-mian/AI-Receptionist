# ---- Stage 1: build the frontend ---------------------------------
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: build + run the backend --------------------------------
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev --no-audit --no-fund
COPY backend/ ./backend/
# compiled frontend lands where the API serves it from (../frontend-dist)
COPY --from=frontend-build /app/frontend/dist ./frontend-dist
RUN cd backend && npm run build
EXPOSE 8787
# NOTE: set JWT_SECRET and ADMIN_DEFAULT_PASSWORD in production.
CMD ["node", "backend/dist/index.js"]
