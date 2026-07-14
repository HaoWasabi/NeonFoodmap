# ─────────────────────────────────────────────
# Stage 1: builder — build Vite production bundle
# ─────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files trước để tận dụng Docker layer cache
# (chỉ re-install khi package.json / package-lock.json thay đổi)
COPY package.json package-lock.json* ./

RUN npm ci --ignore-scripts

# VITE_* env vars được bake vào lúc build (không phải lúc runtime)
# Truyền qua --build-arg khi chạy: docker build --build-arg VITE_API_URL=...
ARG VITE_API_URL=http://localhost:8000/api
ARG VITE_PAYPAL_CLIENT_ID=

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_PAYPAL_CLIENT_ID=$VITE_PAYPAL_CLIENT_ID

# Copy source code và build
COPY . .

RUN npm run build


# ─────────────────────────────────────────────
# Stage 2: runtime — nginx serve static files
# ─────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Xóa config mặc định của nginx
RUN rm /etc/nginx/conf.d/default.conf

# Copy nginx config tùy chỉnh cho React SPA
COPY nginx.conf /etc/nginx/conf.d/app.conf

# Copy static bundle từ stage builder
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
