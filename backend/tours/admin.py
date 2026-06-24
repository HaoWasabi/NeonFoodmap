from django.contrib import admin
from django.utils.html import format_html
from .models import Tour, Tour_POI


class TourPOIInline(admin.TabularInline):
    model = Tour_POI
    extra = 1
    fields = ['poi', 'sequence_order', 'status']
    ordering = ['sequence_order']


@admin.register(Tour)
class TourAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'tour_name', 'poi_count', 'estimated_duration_min',
        'created_by', 'is_suggested', 'premium_badge', 'premium_price_display',
        'status_badge',
    ]
    list_filter = ('status', 'is_suggested', 'is_premium')
    search_fields = ('tour_name', 'description', 'created_by__username')
    inlines = [TourPOIInline]
    list_per_page = 25

    fieldsets = (
        (None, {
            'fields': (
                'tour_name', 'description',
                'translated_name', 'translated_description',
                'estimated_duration_min', 'created_by',
                'is_suggested', 'status',
            ),
        }),
        ('💎 Premium Tour', {
            'fields': ('is_premium', 'premium_price'),
            'description': 'Đánh dấu tour Premium và thiết lập giá mở khóa.',
        }),
    )

    def status_badge(self, obj):
        color = '#28a745' if obj.status == 1 else '#dc3545'
        label = '✅ Hoạt động' if obj.status == 1 else '❌ Ẩn'
        return format_html(
            '<span style="color:{};font-weight:600">{}</span>', color, label
        )
    status_badge.short_description = 'Trạng thái'
    status_badge.admin_order_field = 'status'

    def poi_count(self, obj):
        count = obj.tour_pois.count()
        return format_html('<span style="font-weight:600">📍 {}</span>', count)
    poi_count.short_description = 'Số POI'

    def premium_badge(self, obj):
        if obj.is_premium:
            return format_html(
                '<span style="background:#fbbf24;color:#78350f;padding:2px 8px;'
                'border-radius:12px;font-weight:700;font-size:11px">⭐ Premium</span>'
            )
        return format_html(
            '<span style="color:#94a3b8;font-size:11px">Miễn phí</span>'
        )
    premium_badge.short_description = 'Loại tour'
    premium_badge.admin_order_field = 'is_premium'

    def premium_price_display(self, obj):
        if obj.is_premium and obj.premium_price:
            price_str = f"{obj.premium_price:,}".replace(',', '.')
            return format_html(
                '<span style="font-weight:700;color:#b45309">{}₫</span>',
                price_str,
            )
        return '—'
    premium_price_display.short_description = 'Giá Premium'


@admin.register(Tour_POI)
class TourPOIAdmin(admin.ModelAdmin):
    list_display = ('id', 'tour', 'poi', 'sequence_order', 'status')
    list_filter = ('status', 'tour')
    search_fields = ('tour__tour_name', 'poi__name')
    ordering = ('tour', 'sequence_order')
    list_per_page = 40
