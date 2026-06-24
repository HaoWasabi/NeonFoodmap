from django.contrib import admin
from django.utils.html import format_html
from django.utils import timezone
from django.db.models import Count
from datetime import timedelta

from .models import BreadcrumbLog, NarrationLog


# ── Dashboard stat helpers ───────────────────────────────────────────────────

def get_active_users_count(minutes: int = 15) -> int:
    """Số users (non-null) có NarrationLog trong `minutes` phút gần nhất."""
    cutoff = timezone.now() - timedelta(minutes=minutes)
    auth_users = (
        NarrationLog.objects
        .filter(start_time__gte=cutoff, user__isnull=False)
        .values('user')
        .distinct()
        .count()
    )
    guest_logs = NarrationLog.objects.filter(start_time__gte=cutoff, user__isnull=True).count()
    return auth_users + guest_logs


def get_today_narration_count() -> int:
    now = timezone.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return NarrationLog.objects.filter(start_time__gte=today_start).count()


def get_hot_pois(top_n: int = 5):
    """POI có nhiều lượt nghe nhất trong 1 giờ qua."""
    cutoff = timezone.now() - timedelta(hours=1)
    return (
        NarrationLog.objects
        .filter(start_time__gte=cutoff)
        .values('poi__name', 'poi__id')
        .annotate(count=Count('id'))
        .order_by('-count')[:top_n]
    )


# ── Custom AdminSite để inject stats vào index ───────────────────────────────

class BCSDAdminSite(admin.AdminSite):
    pass


# ── NarrationLog Admin ───────────────────────────────────────────────────────

@admin.register(NarrationLog)
class NarrationLogAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'poi_name', 'user_label', 'trigger_badge',
        'start_time', 'duration_display', 'status',
    ]
    list_filter = ['trigger_type', 'status', 'start_time']
    search_fields = ['user__email', 'user__username', 'poi__name']
    ordering = ['-start_time']
    readonly_fields = ['user', 'poi', 'trigger_type', 'start_time']
    list_select_related = ['user', 'poi']
    list_per_page = 40

    def poi_name(self, obj):
        return obj.poi.name if obj.poi else '—'
    poi_name.short_description = 'POI'
    poi_name.admin_order_field = 'poi__name'

    def user_label(self, obj):
        if obj.user:
            return format_html('<span>👤 {}</span>', obj.user.email or obj.user.username)
        return format_html('<span style="color:#aaa">🌐 Khách</span>')
    user_label.short_description = 'Người dùng'

    def trigger_badge(self, obj):
        if obj.trigger_type == NarrationLog.TriggerType.QR:
            return format_html(
                '<span style="background:#0066cc;color:#fff;padding:2px 8px;'
                'border-radius:4px;font-size:11px">📱 QR</span>'
            )
        return format_html(
            '<span style="background:#28a745;color:#fff;padding:2px 8px;'
            'border-radius:4px;font-size:11px">📍 AUTO</span>'
        )
    trigger_badge.short_description = 'Trigger'
    trigger_badge.admin_order_field = 'trigger_type'

    def duration_display(self, obj):
        if obj.duration is None:
            return format_html('<span style="color:#aaa">—</span>')
        m, s = divmod(obj.duration, 60)
        return f'{m}:{s:02d}'
    duration_display.short_description = 'Thời lượng'
    duration_display.admin_order_field = 'duration'

    def has_add_permission(self, request):
        return False

    def changelist_view(self, request, extra_context=None):
        """Inject realtime stats vào đầu trang danh sách NarrationLog."""
        extra_context = extra_context or {}
        extra_context['active_users']   = get_active_users_count(15)
        extra_context['today_plays']    = get_today_narration_count()
        extra_context['hot_pois']       = get_hot_pois(5)
        return super().changelist_view(request, extra_context=extra_context)


# ── BreadcrumbLog Admin ──────────────────────────────────────────────────────

@admin.register(BreadcrumbLog)
class BreadcrumbLogAdmin(admin.ModelAdmin):
    list_display = ['id', 'user_label', 'lat', 'long', 'timestamp', 'status']
    list_filter = ['status', 'timestamp']
    search_fields = ['user__email', 'user__username']
    ordering = ['-timestamp']
    readonly_fields = ['user', 'lat', 'long', 'timestamp']
    list_per_page = 50

    def user_label(self, obj):
        if obj.user:
            return obj.user.email or obj.user.username
        return format_html('<span style="color:#aaa">🌐 Khách</span>')
    user_label.short_description = 'Người dùng'

    def has_add_permission(self, request):
        return False
