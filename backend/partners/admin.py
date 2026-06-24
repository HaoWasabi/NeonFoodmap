from django.contrib import admin
from django.utils.html import format_html
from .models import Partner
from users.permissions import user_has_partner_premium_access


@admin.register(Partner)
class PartnerAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'business_name', 'address', 'user', 'poi', 'poi_timestamps',
        'opening_hours', 'has_intro_tts', 'status_badge', 'premium_badge',
    ]
    list_filter = ['status', 'poi', 'user']
    search_fields = ['business_name', 'address', 'poi__name', 'user__email', 'user__username']
    list_select_related = ['poi', 'user']
    list_per_page = 30
    readonly_fields = ['created_at', 'updated_at']
    actions = ['mark_pending_approval', 'approve_selected', 'reject_selected']

    fieldsets = (
        ('Thông tin cơ sở', {
            'fields': (
                'user', 'poi', 'business_name', 'address', 'opening_hours', 'status',
                'created_at', 'updated_at',
            ),
            'description': 'Flow mới: tạo Partner trước (user), POI có thể để trống và liên kết sau.',
        }),
        ('🎙️ Nội dung TTS giới thiệu', {
            'description': (
                'Văn bản sẽ được đọc TTS sau khi thuyết minh POI kết thúc. '
                'Để trống nếu không muốn phát giới thiệu đối tác.'
            ),
            'fields': ('intro_text',),
        }),
        ('📱 QR Code trên App', {
            'description': 'URL sẽ được mã hoá thành QR Code và hiển thị trên popup khi khách chạm vào card đối tác.',
            'fields': ('qr_url',),
        }),
        ('📋 Menu & Chi tiết', {
            'fields': ('menu_details',),
            'classes': ('collapse',),
        }),
    )

    add_fieldsets = (
        ('Thông tin cơ sở', {
            'fields': ('user', 'business_name', 'address', 'opening_hours', 'status'),
            'description': 'Tạo Partner trước. POI sẽ được liên kết sau khi Partner tạo POI riêng.',
        }),
        ('🎙️ Nội dung TTS giới thiệu', {
            'fields': ('intro_text',),
        }),
        ('📱 QR Code trên App', {
            'fields': ('qr_url',),
        }),
        ('📋 Menu & Chi tiết', {
            'fields': ('menu_details',),
            'classes': ('collapse',),
        }),
    )

    def get_fieldsets(self, request, obj=None):
        # Ẩn field POI ở màn hình tạo mới Partner.
        if obj is None:
            return self.add_fieldsets
        return super().get_fieldsets(request, obj)

    def poi_timestamps(self, obj):
        if not obj.poi_id or not obj.poi:
            return format_html('<span style="color:#999">—</span>')
        p = obj.poi
        c = p.created_at.strftime('%d/%m/%Y %H:%M') if getattr(p, 'created_at', None) else '—'
        u = p.updated_at.strftime('%d/%m/%Y %H:%M') if getattr(p, 'updated_at', None) else '—'
        return format_html(
            '<span style="font-size:11px;line-height:1.35" title="POI liên kết">'
            'Tạo: <b>{}</b><br/>Sửa: <b>{}</b></span>',
            c, u,
        )

    poi_timestamps.short_description = 'POI (tạo / cập nhật)'

    def has_intro_tts(self, obj):
        if obj.intro_text and obj.intro_text.strip():
            preview = obj.intro_text[:40] + ('...' if len(obj.intro_text) > 40 else '')
            return format_html(
                '<span style="color:#28a745" title="{}">✅ Có TTS</span>', preview
            )
        return format_html('<span style="color:#6c757d">— Chưa có</span>')
    has_intro_tts.short_description = 'Intro TTS'

    def status_badge(self, obj):
        colors = {
            Partner.Status.ACTIVE: '#28a745',
            Partner.Status.INACTIVE: '#dc3545',
            Partner.Status.PENDING_APPROVAL: '#ffc107',
        }
        labels = {
            Partner.Status.ACTIVE: '✅ Hoạt động',
            Partner.Status.INACTIVE: '❌ Bị từ chối',
            Partner.Status.PENDING_APPROVAL: '⏳ Chờ duyệt',
        }
        color = colors.get(obj.status, '#6c757d')
        label = labels.get(obj.status, str(obj.status))
        return format_html(
            '<span style="color:{};font-weight:600">{}</span>', color, label
        )
    status_badge.short_description = 'Trạng thái'
    status_badge.admin_order_field = 'status'

    def premium_badge(self, obj):
        if obj.user_id and user_has_partner_premium_access(obj.user):
            return format_html(
                '<span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:12px;font-weight:700;font-size:11px">💎 Premium</span>'
            )
        return format_html(
            '<span style="color:#94a3b8;font-size:11px">Chưa mở khóa</span>'
        )
    premium_badge.short_description = 'Gói'

    @admin.action(description='⏳ Đánh dấu chờ phê duyệt')
    def mark_pending_approval(self, request, queryset):
        updated = queryset.update(status=Partner.Status.PENDING_APPROVAL)
        self.message_user(request, f'{updated} đối tác được đánh dấu chờ duyệt.')

    @admin.action(description='✅ Duyệt đối tác đã chọn')
    def approve_selected(self, request, queryset):
        updated = queryset.update(status=Partner.Status.ACTIVE)
        self.message_user(request, f'{updated} đối tác đã được duyệt.')

    @admin.action(description='❌ Từ chối đối tác đã chọn')
    def reject_selected(self, request, queryset):
        updated = queryset.update(status=Partner.Status.INACTIVE)
        self.message_user(request, f'{updated} đối tác đã bị từ chối.')
