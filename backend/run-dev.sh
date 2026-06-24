#!/usr/bin/env bash
# Bind 0.0.0.0 so the API is reachable via LAN/public IP (not only localhost).
cd "$(dirname "$0")"
exec python manage.py runserver 0.0.0.0:8000
