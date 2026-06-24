"""
Custom Django AdminSite for Bước Chân Sói Đá CMS.
Injects realtime stats (active users, narration count, hot POIs) into the admin index page.
"""
from django.contrib.admin import AdminSite
from django.utils import timezone
from django.db.models import Count
from datetime import timedelta


class BCSDAdminSite(AdminSite):
    site_header  = 'NeonFoodmap · CMS'
    site_title   = 'NeonFoodmap Admin'
    index_title  = '🏕️  Tổng quan hệ thống'

    def _get_stats(self):
        try:
            from analytics.models import NarrationLog
            now        = timezone.now()
            cutoff_15  = now - timedelta(minutes=15)
            cutoff_1h  = now - timedelta(hours=1)
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

            auth_users = (
                NarrationLog.objects
                .filter(start_time__gte=cutoff_15, user__isnull=False)
                .values('user').distinct().count()
            )
            guest_logs = NarrationLog.objects.filter(start_time__gte=cutoff_15, user__isnull=True).count()
            active_users = auth_users + guest_logs
            today_plays = NarrationLog.objects.filter(start_time__gte=today_start).count()
            hot_pois = (
                NarrationLog.objects
                .filter(start_time__gte=cutoff_1h)
                .values('poi__name', 'poi__id')
                .annotate(count=Count('id'))
                .order_by('-count')[:5]
            )
            return {
                'active_users': active_users,
                'today_plays': today_plays,
                'hot_pois': list(hot_pois),
            }
        except Exception:
            return {'active_users': 0, 'today_plays': 0, 'hot_pois': []}

    def index(self, request, extra_context=None):
        from django.contrib.admin import AdminSite
        extra_context = extra_context or {}
        extra_context.update(self._get_stats())
        return AdminSite.index(self, request, extra_context=extra_context)


# Singleton instance — dùng thay thế admin.site mặc định
bcsd_admin_site = BCSDAdminSite(name='admin')
