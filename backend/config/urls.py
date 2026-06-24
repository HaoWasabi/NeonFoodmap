"""
URL configuration for BuocChanSoiDa project.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

# ── Custom Admin Branding & Dashboard Stats ─────────────────────────────────
# Patch admin.site.index để inject realtime stats vào trang chủ admin.
# Tất cả @admin.register(...) vẫn dùng admin.site (không thay đổi registry).
from config.admin import BCSDAdminSite as _BCSDAdminSite

admin.site.site_header = 'NeonFoodmap · CMS'
admin.site.site_title  = 'NeonFoodmap Admin'
admin.site.index_title = '🏕️  Tổng quan hệ thống'

# Gắn _get_stats và override index từ BCSDAdminSite sang admin.site
import types as _types
_bcsd_cls = _BCSDAdminSite
admin.site._get_stats = _types.MethodType(_bcsd_cls._get_stats, admin.site)
admin.site.index      = _types.MethodType(_bcsd_cls.index,      admin.site)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('core.urls')),
    path('api/pois/', include('pois.urls')),
    path('api/partners/', include('partners.urls')),
    path('api/tours/', include('tours.urls')),
    path('api/users/', include('users.urls')),
    path('api/analytics/', include('analytics.urls')),
    path('api/payments/', include('payments.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
