from django.contrib import admin
from .models import Media


@admin.register(Media)
class MediaAdmin(admin.ModelAdmin):
    list_display = ('id', 'media_type', 'language', 'voice_region', 'status', 'created_at')
    list_filter = ('media_type', 'language', 'status')
    search_fields = ('language', 'voice_region')
    list_per_page = 25
    readonly_fields = ('file_url_display', 'created_at', 'updated_at')

    @admin.display(description='URL Cloudinary')
    def file_url_display(self, obj):
        return obj.file_url or '—'
