from django.contrib import admin
from django.utils.html import format_html

from .models import Invoice, PartnerPremiumPurchase, PaymentConfig, TourPurchase


@admin.register(PaymentConfig)
class PaymentConfigAdmin(admin.ModelAdmin):
    list_display = ('partner_premium_price_display', 'updated_at')
    fields = ('partner_premium_price_vnd',)

    def has_add_permission(self, request):
        return not PaymentConfig.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

    def partner_premium_price_display(self, obj):
        amount_str = f"{obj.partner_premium_price_vnd:,}".replace(',', '.')
        return format_html('<span style="font-weight:700">{}₫</span>', amount_str)
    partner_premium_price_display.short_description = 'Giá Partner Premium'


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ('id_short', 'user', 'reason', 'amount_display', 'status_badge', 'paid_at', 'created_at')
    list_filter = ('status',)
    search_fields = ('reason', 'user__email', 'user__username', 'transaction_code')
    readonly_fields = ('id', 'transaction_code', 'paid_at', 'created_at', 'updated_at')
    list_per_page = 30

    def id_short(self, obj):
        return str(obj.id)[:8] + '…'
    id_short.short_description = 'ID'

    def amount_display(self, obj):
        amount_str = f"{obj.amount:,}".replace(',', '.')
        return format_html('<span style="font-weight:700">{}₫</span>', amount_str)
    amount_display.short_description = 'Số tiền'

    def status_badge(self, obj):
        colors = {
            'PENDING': ('#f59e0b', '#78350f', '⏳'),
            'SUCCESS': ('#22c55e', '#14532d', '✅'),
            'FAILED': ('#ef4444', '#7f1d1d', '❌'),
            'CANCELLED': ('#94a3b8', '#334155', '🚫'),
        }
        bg, fg, icon = colors.get(obj.status, ('#94a3b8', '#334155', ''))
        return format_html(
            '<span style="background:{};color:{};padding:2px 8px;border-radius:12px;'
            'font-size:11px;font-weight:700">{} {}</span>',
            bg, fg, icon, obj.get_status_display(),
        )
    status_badge.short_description = 'Trạng thái'
    status_badge.admin_order_field = 'status'


@admin.register(TourPurchase)
class TourPurchaseAdmin(admin.ModelAdmin):
    list_display = ('id_short', 'user', 'tour', 'invoice_status', 'purchased_at')
    list_filter = ('tour',)
    search_fields = ('user__email', 'user__username', 'tour__tour_name')
    readonly_fields = ('id', 'purchased_at')
    raw_id_fields = ('user', 'tour', 'invoice')
    list_per_page = 30

    def id_short(self, obj):
        return str(obj.id)[:8] + '…'
    id_short.short_description = 'ID'

    def invoice_status(self, obj):
        if obj.invoice:
            return obj.invoice.get_status_display()
        return '—'
    invoice_status.short_description = 'Thanh toán'


@admin.register(PartnerPremiumPurchase)
class PartnerPremiumPurchaseAdmin(admin.ModelAdmin):
    list_display = ('id_short', 'user', 'invoice_status', 'purchased_at')
    search_fields = ('user__email', 'user__username', 'invoice__transaction_code')
    readonly_fields = ('id', 'purchased_at')
    raw_id_fields = ('user', 'invoice')
    list_per_page = 30

    def id_short(self, obj):
        return str(obj.id)[:8] + '…'
    id_short.short_description = 'ID'

    def invoice_status(self, obj):
        if obj.invoice:
            return obj.invoice.get_status_display()
        return '—'
    invoice_status.short_description = 'Thanh toán'
