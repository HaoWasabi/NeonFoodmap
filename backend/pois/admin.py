from django.contrib import admin
from django.utils.html import format_html
from django.contrib import messages
from django import forms
from .models import POI, Media, Partner

# ─── Language code mappings ────────────────────────────────────────────────────
LANG_TO_TTS = {
    'vi': 'vi-VN',
    'en': 'en-US',
    'ja': 'ja-JP',
    'ko': 'ko-KR',
    'zh': 'zh-CN',
    'fr': 'fr-FR',
    'de': 'de-DE',
    'es': 'es-ES',
    'th': 'th-TH',
}

LANG_NAMES = {
    'vi': 'Tiếng Việt', 'en': 'English', 'ja': '日本語',
    'ko': '한국어', 'zh': '中文', 'fr': 'Français',
    'de': 'Deutsch', 'es': 'Español', 'th': 'ภาษาไทย',
}


# ─── Forms ──────────────────────────────────────────────────────────────────
class POIAdminForm(forms.ModelForm):
    # Đã tắt: gán Partner đã tồn tại từ màn POI — quản lý liên kết ở Partner admin / cổng Partner.
    # existing_partners = forms.ModelMultipleChoiceField(
    #     queryset=Partner.objects.all(),
    #     required=False,
    #     label='Gán đối tác đã tồn tại',
    #     help_text='Chọn các Partner đã tồn tại để liên kết vào POI này (quan hệ 1 POI - nhiều Partner).',
    #     widget=admin.widgets.FilteredSelectMultiple('Partners', is_stacked=False),
    # )
    #
    # def __init__(self, *args, **kwargs):
    #     super().__init__(*args, **kwargs)
    #     self.fields['existing_partners'].queryset = Partner.objects.all().order_by('business_name')
    #     if self.instance and self.instance.pk:
    #         self.fields['existing_partners'].initial = Partner.objects.filter(poi=self.instance)

    class Meta:
        model = POI
        fields = '__all__'
        widgets = {
            'latitude': forms.NumberInput(attrs={'step': 'any', 'placeholder': '10.755...', 'style': 'width:180px'}),
            'longitude': forms.NumberInput(attrs={'step': 'any', 'placeholder': '106.703...', 'style': 'width:180px'}),
        }


# ─── Inlines ────────────────────────────────────────────────────────────────
class MediaInline(admin.StackedInline):
    model = Media
    extra = 1
    fields = ['language', 'voice_region', 'media_type', 'file_url', 'tts_content', 'audio_player', 'status']
    readonly_fields = ['audio_player']

    def audio_player(self, obj):
        if obj.file_url:
            return format_html(
                '<audio controls style="width:100%;max-width:400px"><source src="{}" type="audio/mpeg"></audio>'
                '<br><a href="{}" target="_blank" style="font-size:12px;color:#0066cc">🔗 {}</a>',
                obj.file_url, obj.file_url, obj.file_url[:80] + '...' if len(obj.file_url) > 80 else obj.file_url
            )
        return format_html('<span style="color:#999">⏳ Chưa có file TTS — sẽ tự động tạo khi lưu POI</span>')
    audio_player.short_description = '🔊 Nghe TTS Audio'


class PartnerInline(admin.TabularInline):
    model = Partner
    extra = 1
    fields = ['business_name', 'intro_text', 'opening_hours', 'status']


# ─── POI Admin ──────────────────────────────────────────────────────────────
@admin.register(POI)
class POIAdmin(admin.ModelAdmin):
    form = POIAdminForm
    list_display = [
        'id', 'name', 'category', 'latitude', 'longitude', 'geofence_radius',
        'status_badge', 'cover_thumbnail', 'created_at', 'updated_at', 'narration_count',
    ]
    readonly_fields = ['created_at', 'updated_at', 'cover_preview']
    list_filter = ['status', 'category']
    search_fields = ['name', 'description', 'qr_code_data']
    ordering = ['name']
    # Không thêm Partner trực tiếp khi tạo/sửa POI.
    # Partner được quản lý riêng ở trang Partner admin để giữ flow rõ ràng.
    inlines = [MediaInline]
    list_per_page = 30

    fieldsets = (
        ('Thông tin cơ bản', {
            'fields': ('name', 'description', 'category', 'status', 'created_at', 'updated_at'),
        }),
        ('🖼️ Ảnh bìa', {
            'fields': ('cover_image_url', 'cover_preview'),
            'description': 'URL ảnh bìa hiển thị cho điểm tham quan (thường được tự động cập nhật khi Partner upload).',
        }),
        ('📍 Vị trí & Geofence', {
            'description': (
                '👉 Nhập toạ độ thủ công, hoặc mở Google Maps → click chuột phải → '
                '"Copy coordinates" → dán vào 2 ô dưới đây.<br>'
                '📌 Ví dụ phố Vĩnh Khánh Q4: Vĩ độ <b>10.7552</b>, Kinh độ <b>106.7038</b>'
            ),
            'fields': ('latitude', 'longitude', 'geofence_radius'),
        }),
        ('QR Code', {
            'fields': ('qr_code_data',),
            'classes': ('collapse',),
        }),
        # ('🤝 Liên kết đối tác đã tồn tại', {
        #     'description': 'Không tạo Partner mới tại đây. Chỉ gán các Partner đã có vào POI này.',
        #     'fields': ('existing_partners',),
        # }),
    )

    # def save_related(self, request, form, formsets, change):
    #     super().save_related(request, form, formsets, change)
    #     if 'existing_partners' not in form.cleaned_data:
    #         return
    #     selected_ids = set(form.cleaned_data['existing_partners'].values_list('id', flat=True))
    #     current_ids = set(Partner.objects.filter(poi=form.instance).values_list('id', flat=True))
    #     ids_to_unlink = current_ids - selected_ids
    #     if ids_to_unlink:
    #         Partner.objects.filter(id__in=ids_to_unlink).update(poi=None)
    #     ids_to_link = selected_ids - current_ids
    #     if ids_to_link:
    #         Partner.objects.filter(id__in=ids_to_link).update(poi=form.instance)

    def status_badge(self, obj):
        colors = {POI.Status.ACTIVE: '#28a745', POI.Status.INACTIVE: '#dc3545'}
        labels = {POI.Status.ACTIVE: '✅ Hoạt động', POI.Status.INACTIVE: '❌ Ẩn'}
        return format_html(
            '<span style="color:{};font-weight:600">{}</span>',
            colors.get(obj.status, '#6c757d'),
            labels.get(obj.status, str(obj.status)),
        )
    status_badge.short_description = 'Trạng thái'
    status_badge.admin_order_field = 'status'

    def narration_count(self, obj):
        count = obj.narration_logs.count()
        return format_html('<span style="font-weight:600;color:#0066cc">🎧 {}</span>', count)
    narration_count.short_description = 'Lượt nghe'

    def cover_thumbnail(self, obj):
        if obj.cover_image_url:
            return format_html(
                '<img src="{}" style="height:36px;width:64px;object-fit:cover;border-radius:4px;border:1px solid #e2e8f0" />',
                obj.cover_image_url,
            )
        return format_html('<span style="color:#ccc;font-size:11px">— Chưa có ảnh</span>')
    cover_thumbnail.short_description = 'Ảnh bìa'

    def cover_preview(self, obj):
        if obj.cover_image_url:
            return format_html(
                '<div style="margin-top:4px">'
                '<img src="{}" style="max-width:480px;max-height:240px;border-radius:8px;border:1px solid #e2e8f0;object-fit:cover" />'
                '<br><a href="{}" target="_blank" style="font-size:11px;color:#0066cc">&#128279; {}</a>'
                '</div>',
                obj.cover_image_url, obj.cover_image_url,
                obj.cover_image_url[:80] + '...' if len(obj.cover_image_url) > 80 else obj.cover_image_url,
            )
        return format_html('<span style="color:#999">⚠️ Chưa có ảnh bìa</span>')
    cover_preview.short_description = '🖼️ Xem trước ảnh bìa'


# ─── Media Admin ─────────────────────────────────────────────────────────────
@admin.register(Media)
class MediaAdmin(admin.ModelAdmin):
    list_display = ['id', 'poi', 'language_label', 'voice_region', 'media_type', 'tts_status', 'audio_status', 'status', 'preview_link']
    list_filter = ['language', 'media_type', 'status']
    search_fields = ['poi__name']
    list_select_related = ['poi']
    list_per_page = 30
    readonly_fields = ['preview_link', 'original_text_display', 'audio_player']
    actions = ['auto_translate']

    fieldsets = (
        ('📌 Thông tin cơ bản', {
            'fields': ('poi', 'language', 'voice_region', 'media_type', 'status'),
        }),
        ('📝 Văn bản gốc (tham khảo)', {
            'description': 'Nội dung tiếng Việt lấy tự động từ mô tả POI.',
            'fields': ('original_text_display',),
            'classes': ('collapse',),
        }),
        ('🌐 Nội dung đã dịch (→ TTS)', {
            'description': (
                'Điền văn bản đã dịch vào đây để App đọc TTS khi khách chọn ngôn ngữ này. '
                'Hoặc chọn nhiều bản ghi ở danh sách rồi nhấn <b>Action: Tự động dịch</b>.'
            ),
            'fields': ('tts_content',),
        }),
        ('🔊 File TTS Audio (Cloudinary)', {
            'description': 'File âm thanh TTS được tạo tự động khi lưu POI. App ưu tiên phát file này.',
            'fields': ('file_url', 'audio_player'),
        }),
    )

    def original_text_display(self, obj):
        if obj.poi_id:
            text = obj.poi.description or '(Chưa có mô tả)'
            return format_html('<div style="white-space:pre-wrap;max-height:200px;overflow-y:auto;background:#f8f8f8;padding:8px;border-radius:4px">{}</div>', text)
        return '—'
    original_text_display.short_description = '📄 Văn bản gốc (Tiếng Việt)'

    def language_label(self, obj):
        return LANG_NAMES.get(obj.language, obj.language)
    language_label.short_description = 'Ngôn ngữ'
    language_label.admin_order_field = 'language'

    def tts_status(self, obj):
        if obj.tts_content:
            preview = obj.tts_content[:40] + '…' if len(obj.tts_content) > 40 else obj.tts_content
            return format_html('<span style="color:#28a745" title="{}">✅ Đã dịch</span>', preview)
        return format_html('<span style="color:#dc3545">⛔ Chưa dịch</span>')
    tts_status.short_description = 'Nội dung TTS'

    def audio_status(self, obj):
        if obj.file_url:
            return format_html('<span style="color:#28a745">🔊 Có file</span>')
        return format_html('<span style="color:#999">⏳ Chưa có</span>')
    audio_status.short_description = 'TTS Audio'

    def preview_link(self, obj):
        if obj.file_url:
            return format_html('<a href="{}" target="_blank">▶ Nghe</a>', obj.file_url)
        return '—'
    preview_link.short_description = 'Nghe thử'

    def audio_player(self, obj):
        if obj.file_url:
            return format_html(
                '<audio controls style="width:100%%;max-width:500px"><source src="{}" type="audio/mpeg"></audio>'
                '<br><a href="{}" target="_blank" style="font-size:12px;color:#0066cc">🔗 {}</a>',
                obj.file_url, obj.file_url,
                obj.file_url[:80] + '...' if len(obj.file_url) > 80 else obj.file_url
            )
        return format_html('<span style="color:#999">⏳ Chưa có file TTS — sẽ tự động tạo khi lưu POI</span>')
    audio_player.short_description = '🔊 Nghe TTS Audio'

    @admin.action(description='🌐 Tự động dịch nội dung POI sang ngôn ngữ của bản ghi')
    def auto_translate(self, request, queryset):
        try:
            from deep_translator import GoogleTranslator
        except ImportError:
            self.message_user(request, '❌ Thư viện deep-translator chưa được cài. Chạy: pip install deep-translator', messages.ERROR)
            return

        success, skipped, errors = 0, 0, 0
        for media in queryset.select_related('poi'):
            if not media.poi.description:
                skipped += 1
                continue

            target_lang = media.language
            if target_lang == 'vi':
                # Tiếng Việt → không cần dịch, dùng luôn bản gốc
                media.tts_content = media.poi.description
                media.save(update_fields=['tts_content'])
                success += 1
                continue

            try:
                translator = GoogleTranslator(source='vi', target=target_lang)
                translated = translator.translate(media.poi.description)
                media.tts_content = translated
                media.save(update_fields=['tts_content'])
                success += 1
            except Exception as e:
                errors += 1
                self.message_user(
                    request,
                    f'❌ Lỗi dịch [{media.poi.name} → {target_lang}]: {e}',
                    messages.WARNING,
                )

        summary = f'✅ Dịch thành công: {success}'
        if skipped:
            summary += f' | ⏭️ Bỏ qua (chưa có mô tả): {skipped}'
        if errors:
            summary += f' | ❌ Lỗi: {errors}'
        self.message_user(request, summary, messages.SUCCESS if success else messages.WARNING)
