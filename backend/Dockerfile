# ─────────────────────────────────────────────
# Stage 1: builder — cài dependencies vào venv
# ─────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# Cài các thư viện hệ thống cần thiết để build mysqlclient và pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    pkg-config \
    default-libmysqlclient-dev \
    libjpeg-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements trước để tận dụng Docker layer cache
COPY requirements.txt .

# Tạo virtualenv và cài packages vào đó
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir gunicorn==23.0.0


# ─────────────────────────────────────────────
# Stage 2: runtime — image cuối gọn nhất
# ─────────────────────────────────────────────
FROM python:3.12-slim AS runtime

# Chỉ cài runtime libs (không cần dev headers)
RUN apt-get update && apt-get install -y --no-install-recommends \
    default-libmysqlclient-dev \
    libjpeg62-turbo \
    zlib1g \
    && rm -rf /var/lib/apt/lists/*

# Copy virtualenv đã build từ stage 1
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Tạo user không có quyền root để chạy app (bảo mật)
RUN useradd --no-create-home --shell /bin/false appuser

WORKDIR /app

# Copy toàn bộ source code backend
COPY . .

# Tạo thư mục staticfiles và media, gán quyền cho appuser
RUN mkdir -p staticfiles media && \
    chown -R appuser:appuser /app

USER appuser

# Biến môi trường mặc định cho Python
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings

EXPOSE 8000

# Collect static files khi build xong, rồi khởi động Gunicorn
CMD ["sh", "-c", \
    "python manage.py migrate --noinput && \
     python manage.py collectstatic --noinput && \
     gunicorn config.wsgi:application \
       --bind 0.0.0.0:8000 \
       --workers 3 \
       --timeout 120 \
       --access-logfile - \
       --error-logfile -"]
