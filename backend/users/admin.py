from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth import get_user_model

User = get_user_model()


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Admin configuration cho custom User model."""

    list_display = [
        'email', 'username', 'first_name', 'last_name',
        'is_staff', 'is_active', 'status', 'date_joined',
    ]
    list_filter = ['is_staff', 'is_active', 'status', 'preferred_language', 'groups']
    search_fields = ['email', 'username', 'first_name', 'last_name', 'phone_number']
    ordering = ['-date_joined']

    # Thêm các trường custom vào form chỉnh sửa
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Thông tin bổ sung', {
            'fields': (
                'phone_number', 'device_id',
                'preferred_language', 'preferred_voice_region',
                'status',
            ),
        }),
    )

    # Thêm các trường custom vào form tạo user
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('Thông tin bổ sung', {
            'fields': (
                'email', 'first_name', 'last_name',
                'phone_number', 'preferred_language',
            ),
        }),
    )
