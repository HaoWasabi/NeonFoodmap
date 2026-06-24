from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Custom User model.
    Kế thừa AbstractUser (có sẵn username, email, password, is_staff, is_active, ...),
    bổ sung các trường theo ERD.
    Dùng email làm trường đăng nhập chính.
    """

    class Status(models.IntegerChoices):
        INACTIVE = 0, 'Không hoạt động'
        ACTIVE = 1, 'Hoạt động'
        BANNED = 2, 'Bị khóa'

    email = models.EmailField('Email', unique=True)
    device_id = models.CharField('Mã thiết bị', max_length=255, blank=True, default='')
    preferred_language = models.CharField(
        'Ngôn ngữ ưa thích',
        max_length=10,
        default='vi',
        help_text='Mã ngôn ngữ (vi, en, ja, ko, ...)'
    )
    preferred_voice_region = models.CharField(
        'Giọng đọc vùng miền',
        max_length=50,
        blank=True,
        default='',
        help_text='Miền Bắc, Miền Trung, Miền Nam, ...'
    )
    phone_number = models.CharField(
        'Số điện thoại',
        max_length=20,
        blank=True,
        default=''
    )
    status = models.IntegerField(
        'Trạng thái',
        choices=Status.choices,
        default=Status.ACTIVE
    )

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    class Meta:
        db_table = 'users'
        verbose_name = 'Người dùng'
        verbose_name_plural = 'Người dùng'
        ordering = ['-date_joined']

    def __str__(self):
        return f'{self.email} ({self.get_full_name() or self.username})'
