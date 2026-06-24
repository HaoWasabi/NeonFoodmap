from django.db import models
from cloudinary.models import CloudinaryField


class Media(models.Model):
    """
    Model lưu trữ file media (ảnh, audio, video) trên Cloudinary.
    Liên kết tới POI theo ERD.
    """

    class MediaType(models.TextChoices):
        IMAGE = 'image', 'Hình ảnh'
        AUDIO = 'audio', 'Âm thanh'
        VIDEO = 'video', 'Video'

    class Status(models.IntegerChoices):
        INACTIVE = 0, 'Không hoạt động'
        ACTIVE = 1, 'Hoạt động'

    poi = models.ForeignKey(
        'pois.POI',
        on_delete=models.SET_NULL,
        verbose_name='Mã điểm tham quan',
        null=True,
        blank=True,
        related_name='core_media',
        help_text='Điểm tham quan liên kết',
    )

    file = CloudinaryField(
        'File',
        resource_type='auto',  # Tự nhận diện image/video/raw (audio)
        help_text='Upload file ảnh, audio hoặc video lên Cloudinary',
    )

    language = models.CharField(
        'Ngôn ngữ',
        max_length=10,
        default='vi',
        help_text='Mã ngôn ngữ: vi, en, ja, ko, ...',
    )

    voice_region = models.CharField(
        'Giọng vùng miền',
        max_length=50,
        blank=True,
        default='',
        help_text='Miền Bắc, Miền Trung, Miền Nam, ...',
    )

    media_type = models.CharField(
        'Loại media',
        max_length=10,
        choices=MediaType.choices,
        default=MediaType.IMAGE,
    )

    status = models.IntegerField(
        'Trạng thái',
        choices=Status.choices,
        default=Status.ACTIVE,
    )

    created_at = models.DateTimeField('Ngày tạo', auto_now_add=True)
    updated_at = models.DateTimeField('Ngày cập nhật', auto_now=True)

    class Meta:
        db_table = 'media'
        verbose_name = 'Media'
        verbose_name_plural = 'Media'
        ordering = ['-created_at']

    def __str__(self):
        return f'[{self.get_media_type_display()}] {self.language} - {self.file}'

    @property
    def file_url(self):
        """Trả về URL công khai của file trên Cloudinary."""
        if self.file:
            return self.file.url
        return ''
