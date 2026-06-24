import math
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone


class POI(models.Model):
    """
    Điểm tham quan (Point of Interest).
    Định nghĩa đầy đủ theo ERD.
    """

    class Status(models.IntegerChoices):
        INACTIVE = 0, 'Không hoạt động'
        ACTIVE = 1, 'Hoạt động'

    name = models.CharField('Tên điểm', max_length=255)
    description = models.TextField('Mô tả', blank=True, default='')
    latitude = models.FloatField('Vĩ độ')
    longitude = models.FloatField('Kinh độ')
    geofence_radius = models.IntegerField(
        'Bán kính Geofence (mét)',
        default=50,
        help_text='Bán kính tính bằng mét để kích hoạt Narration Engine.'
    )
    category = models.CharField('Danh mục', max_length=100, blank=True, default='')
    cover_image_url = models.URLField(
        'Ảnh bìa',
        max_length=1024,
        blank=True,
        default='',
        help_text='URL ảnh bìa đại diện của điểm tham quan (upload lên Cloudinary).',
    )
    qr_code_data = models.CharField(
        'Dữ liệu QR Code',
        max_length=512,
        blank=True,
        default='',
        help_text='Dữ liệu được mã hoá trong QR Code tại điểm tham quan.',
    )
    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='partner_poi',
        verbose_name='Partner sở hữu',
        help_text='Mỗi tài khoản Partner chỉ được sở hữu tối đa 1 POI.',
    )
    status = models.IntegerField(
        'Trạng thái',
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    created_at = models.DateTimeField('Ngày tạo', auto_now_add=True)
    updated_at = models.DateTimeField('Cập nhật lần cuối', auto_now=True)

    class Meta:
        db_table = 'pois'
        verbose_name = 'Điểm tham quan'
        verbose_name_plural = 'Điểm tham quan'
        ordering = ['name']
        constraints = [
            # Một toạ độ chỉ có tối đa một POI đang ACTIVE; nhiều Partner có thể FK tới cùng POI đó.
            # (Trong Meta không thể tham chiếu POI.Status — Python chỉ resolve tên ở module.)
            models.UniqueConstraint(
                fields=['latitude', 'longitude'],
                condition=Q(status=1),  # Status.ACTIVE
                name='uniq_poi_active_lat_lng',
            ),
        ]

    def __str__(self):
        return self.name

    def clean(self):
        super().clean()
        if self.status != self.Status.ACTIVE:
            return
        qs = POI.objects.filter(
            latitude=self.latitude,
            longitude=self.longitude,
            status=self.Status.ACTIVE,
        )
        if self.pk:
            qs = qs.exclude(pk=self.pk)
        if qs.exists():
            raise ValidationError(
                'Đã tồn tại POI đang hoạt động khác tại cùng vĩ độ/kinh độ.'
            )

    def distance_to(self, lat: float, lng: float) -> float:
        """Tính khoảng cách Haversine từ POI tới toạ độ (lat, lng), đơn vị mét."""
        R = 6_371_000
        φ1, φ2 = math.radians(self.latitude), math.radians(lat)
        Δφ = math.radians(lat - self.latitude)
        Δλ = math.radians(lng - self.longitude)
        a = math.sin(Δφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(Δλ / 2) ** 2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class Media(models.Model):
    """
    File âm thanh / thông tin TTS cho một POI theo ngôn ngữ và vùng miền.
    Phục vụ Media Selection Engine (exact match → language fallback → TTS).
    """

    class MediaType(models.TextChoices):
        AUDIO = 'AUDIO', 'File âm thanh thu sẵn'
        TTS = 'TTS', 'Text-to-Speech'

    class Status(models.IntegerChoices):
        INACTIVE = 0, 'Không hoạt động'
        ACTIVE = 1, 'Hoạt động'

    poi = models.ForeignKey(
        POI,
        on_delete=models.CASCADE,
        related_name='media',
        verbose_name='Điểm tham quan',
    )
    file_url = models.URLField(
        'URL file âm thanh',
        blank=True,
        default='',
        help_text='Để trống nếu loại là TTS.',
    )
    tts_content = models.TextField(
        'Nội dung TTS (bản dịch)',
        blank=True,
        default='',
        help_text=(
            'Văn bản sẽ được đọc TTS. Nếu để trống, hệ thống dùng mô tả gốc của POI. '
            'Nhấn "Tự động dịch" để tự động điền từ mô tả tiếng Việt.'
        ),
    )
    translated_name = models.CharField(
        'Tên đã dịch',
        max_length=255,
        blank=True,
        default='',
        help_text='Tên POI bằng ngôn ngữ này (ví dụ: tên tiếng Nhật).',
    )
    language = models.CharField(
        'Ngôn ngữ',
        max_length=10,
        help_text='Mã ngôn ngữ: vi, en, ja, ko, zh, ...',
    )
    voice_region = models.CharField(
        'Vùng giọng đọc',
        max_length=50,
        blank=True,
        default='',
        help_text='mien_nam, mien_bac, mien_trung, usa, uk, ...',
    )
    media_type = models.CharField(
        'Loại media',
        max_length=10,
        choices=MediaType.choices,
        default=MediaType.AUDIO,
    )
    status = models.IntegerField(
        'Trạng thái',
        choices=Status.choices,
        default=Status.ACTIVE,
    )

    class Meta:
        db_table = 'poi_media'
        verbose_name = 'File âm thanh'
        verbose_name_plural = 'File âm thanh'
        ordering = ['language', 'voice_region']
        indexes = [
            models.Index(fields=['poi', 'language', 'voice_region'], name='media_poi_lang_region_idx'),
        ]

    def __str__(self):
        return f'{self.poi.name} [{self.language}/{self.voice_region}] ({self.media_type})'


class Partner(models.Model):
    """
    Đối tác ẩm thực / dịch vụ liên kết với POI.
    Thuộc tính tuân theo ERD hệ thống.
    """

    class Status(models.IntegerChoices):
        INACTIVE = 0, 'Không hoạt động'
        ACTIVE = 1, 'Hoạt động'
        PENDING_APPROVAL = 2, 'Chờ phê duyệt'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='partner_profile',
        null=True,
        blank=True,
        verbose_name='Tài khoản Partner',
        help_text='Tài khoản sở hữu hồ sơ đối tác.',
    )
    poi = models.ForeignKey(
        POI,
        on_delete=models.SET_NULL,
        related_name='partners',
        verbose_name='Điểm tham quan',
        null=True,
        blank=True,
    )
    business_name = models.CharField('Tên cơ sở', max_length=255)
    address = models.TextField(
        'Địa chỉ',
        blank=True,
        default='',
        help_text='Địa chỉ cơ sở đối tác.',
    )
    intro_text = models.TextField(
        'Đoạn giới thiệu TTS',
        blank=True,
        default='',
        help_text='Đoạn văn ngắn giới thiệu cơ sở cho TTS. Để trống để tự động sinh từ thông tin menu.',
    )
    menu_details = models.JSONField(
        'Chi tiết menu',
        default=dict,
        blank=True,
        help_text='JSON: {"must_try": ["món A", "món B"], "price_range": "50k-100k"}',
    )
    opening_hours = models.CharField(
        'Giờ mở cửa',
        max_length=100,
        blank=True,
        default='',
        help_text='Ví dụ: 07:00 - 22:00',
    )
    qr_url = models.URLField(
        'Link QR (menu / mạng xã hội)',
        blank=True,
        default='',
        max_length=500,
        help_text='URL sẽ mã hoá thành QR Code hiện trên app (ví dụ: link Google Maps, Facebook, Shopeefood...)',
    )
    status = models.IntegerField(
        'Trạng thái',
        choices=Status.choices,
        default=Status.PENDING_APPROVAL,
    )
    created_at = models.DateTimeField('Ngày tạo hồ sơ', auto_now_add=True)
    updated_at = models.DateTimeField('Cập nhật hồ sơ', auto_now=True)

    class Meta:
        db_table = 'partners'
        verbose_name = 'Đối tác'
        verbose_name_plural = 'Đối tác'
        ordering = ['business_name']

    def __str__(self):
        if self.poi_id:
            return f'{self.business_name} @ {self.poi.name}'
        return self.business_name


class PartnerIntroMedia(models.Model):
    """
    Lưu trữ file media (audio) giới thiệu của Partner.
    Liên kết Partner với file Media từ core/models.py.
    Cho phép Partner có nhiều file audio với các ngôn ngữ/giọng khác nhau.
    """

    class Status(models.IntegerChoices):
        INACTIVE = 0, 'Không hoạt động'
        ACTIVE = 1, 'Hoạt động'

    partner = models.ForeignKey(
        Partner,
        on_delete=models.CASCADE,
        related_name='intro_media',
        verbose_name='Đối tác',
    )
    # Tham chiếu đến file media từ core.models (Cloudinary)
    media_id = models.IntegerField(
        'Mã file media',
        help_text='ID của file media từ bảng core.media (upload vào Cloudinary)',
    )
    language = models.CharField(
        'Ngôn ngữ',
        max_length=10,
        default='vi',
        help_text='Mã ngôn ngữ: vi, en, ja, ko, ...',
    )
    voice_region = models.CharField(
        'Vùng giọng đọc',
        max_length=50,
        blank=True,
        default='',
        help_text='mien_bac, mien_trung, mien_nam, usa, uk, ...',
    )
    status = models.IntegerField(
        'Trạng thái',
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    created_at = models.DateTimeField('Ngày tạo', default=timezone.now)

    class Meta:
        db_table = 'partner_intro_media'
        verbose_name = 'File giới thiệu Partner'
        verbose_name_plural = 'File giới thiệu Partner'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['partner', 'language', 'voice_region'], name='partner_intro_lang_idx'),
        ]

    def __str__(self):
        return f'{self.partner.business_name} [{self.language}/{self.voice_region}]'


class PartnerInteraction(models.Model):
    """
    Theo dõi tương tác người dùng với Partner (impressions, clicks, calls, ...).
    Dùng để cung cấp analytics cho Partner về hiệu quả tiếp thị.
    Dữ liệu được collect ẩn danh nếu user không đăng nhập.
    """

    class InteractionType(models.TextChoices):
        IMPRESSION = 'impression', 'Hiển thị card'
        CLICK = 'click', 'Click vào card'
        CALL = 'call', 'Gọi điện'
        WEBSITE = 'website', 'Truy cập website'
        DIRECTION = 'direction', 'Lấy chỉ đường'

    class Status(models.IntegerChoices):
        INACTIVE = 0, 'Không hoạt động'
        ACTIVE = 1, 'Hoạt động'

    partner = models.ForeignKey(
        Partner,
        on_delete=models.CASCADE,
        related_name='interactions',
        verbose_name='Đối tác',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='partner_interactions',
        verbose_name='Người dùng',
        help_text='Null nếu user không đăng nhập (anonymous)',
    )
    interaction_type = models.CharField(
        'Loại tương tác',
        max_length=20,
        choices=InteractionType.choices,
    )
    timestamp = models.DateTimeField('Thời điểm', default=timezone.now)
    status = models.IntegerField(
        'Trạng thái',
        choices=Status.choices,
        default=Status.ACTIVE,
    )

    class Meta:
        db_table = 'partner_interactions'
        verbose_name = 'Tương tác Partner'
        verbose_name_plural = 'Tương tác Partner'
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['partner', 'interaction_type', 'timestamp'], name='partner_interaction_idx'),
        ]

    def __str__(self):
        user_info = f'({self.user.email})' if self.user else '(anonymous)'
        return f'{self.partner.business_name} {self.get_interaction_type_display()} {user_info}'
