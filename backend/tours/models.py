from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.conf import settings
from pois.models import POI
from django.db.models import Max

class Tour(models.Model):
    """
    Tour tham quan.
    """

    class Status(models.IntegerChoices):
        INACTIVE = 0, 'Không hoạt động'
        ACTIVE = 1, 'Hoạt động'

    id = models.BigAutoField(primary_key=True)
    tour_name = models.CharField('Tên tour', max_length=255)
    description = models.TextField('Mô tả', blank=True, default='')
    translated_name = models.JSONField(
        'Tên tour (đa ngôn ngữ)',
        default=dict,
        blank=True,
        help_text='JSON: {"en": "Name", "ja": "Name"}'
    )
    translated_description = models.JSONField(
        'Mô tả tour (đa ngôn ngữ)',
        default=dict,
        blank=True,
        help_text='JSON: {"en": "Desc", "ja": "Desc"}'
    )
    estimated_duration_min = models.IntegerField(
        'Thời lượng ước tính (phút)',
        null=True,
        blank=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='tours',
        verbose_name='Người tạo'
    )
    is_suggested = models.BooleanField('Tour đề xuất', default=False)
    is_premium = models.BooleanField('Tour Premium', default=False,
        help_text='Đánh dấu tour cần trả phí mở khóa')
    premium_price = models.PositiveBigIntegerField(
        'Giá Premium (VND)', default=0, blank=True,
        help_text='Giá mở khóa tour premium (đơn vị VND). Bỏ trống hoặc 0 nếu miễn phí.')
    status = models.IntegerField(
        'Trạng thái',
        choices=Status.choices,
        default=Status.ACTIVE,
    )

    class Meta:
        db_table = 'tours'
        verbose_name = 'Tour'
        verbose_name_plural = 'Tours'
        ordering = ['-id']

    def __str__(self):
        return self.tour_name


class Tour_POI(models.Model):
    """
    Mapping Điểm tham quan (POI) vào Tour.
    """

    class Status(models.IntegerChoices):
        INACTIVE = 0, 'Không hoạt động'
        ACTIVE = 1, 'Hoạt động'

    id = models.BigAutoField(primary_key=True)
    tour = models.ForeignKey(
        Tour,
        on_delete=models.CASCADE,
        related_name='tour_pois',
        verbose_name='Tour'
    )
    poi = models.ForeignKey(
        POI,
        on_delete=models.CASCADE,
        related_name='tour_pois',
        verbose_name='Điểm tham quan'
    )
    sequence_order = models.IntegerField(
        'Thứ tự', 
        default=1,
        validators=[MinValueValidator(1)]
    )
    status = models.IntegerField(
        'Trạng thái',
        choices=Status.choices,
        default=Status.ACTIVE,
    )

    class Meta:
        db_table = 'tour_pois'
        verbose_name = 'Điểm tham quan của Tour'
        verbose_name_plural = 'Các điểm tham quan của Tour'
        ordering = ['tour', 'sequence_order']
        constraints = [
            models.UniqueConstraint(
                fields=['tour', 'sequence_order'],
                name='uniq_tour_sequence_order',
            ),
            models.UniqueConstraint(
                fields=['tour', 'poi'],
                name='uniq_tour_poi',
            ),
        ]

    def save(self, *args, **kwargs):
        """
        Nếu không set sequence_order khi tạo mới, tự lấy max(sequence_order)+1 trong tour.
        """
        if self._state.adding:
            # Trường hợp API/ORM không truyền (None/<=0)
            should_auto = self.sequence_order is None or self.sequence_order <= 0

            # Trường hợp user không nhập gì trong admin/ORM (default=1)
            # Nếu tour đã có sequence_order=1 thì coi như "chưa set" và auto max+1
            if not should_auto and self.sequence_order == 1:
                if Tour_POI.objects.filter(tour=self.tour, sequence_order=1).exists():
                    should_auto = True

        if self._state.adding and should_auto:
            max_order = (
                Tour_POI.objects.filter(tour=self.tour)
                .aggregate(m=Max('sequence_order'))
                .get('m')
            )
            self.sequence_order = (max_order or 0) + 1
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.tour.tour_name} - {self.poi.name} ({self.sequence_order})'


class TourReview(models.Model):
    """
    Đánh giá và nhận xét của người dùng về Tour.
    """
    id = models.BigAutoField(primary_key=True)
    tour = models.ForeignKey(
        Tour,
        on_delete=models.CASCADE,
        related_name='reviews',
        verbose_name='Tour'
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='tour_reviews',
        verbose_name='Người dùng'
    )
    rating = models.IntegerField(
        'Đánh giá',
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text='Số sao từ 1 đến 5'
    )
    comment = models.TextField(
        'Nhận xét',
        blank=True,
        default='',
        help_text='Nội dung nhận xét của người dùng'
    )
    created_at = models.DateTimeField('Ngày tạo', auto_now_add=True)

    class Meta:
        db_table = 'tour_reviews'
        verbose_name = 'Đánh giá Tour'
        verbose_name_plural = 'Đánh giá Tours'
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['tour', 'user'],
                name='uniq_tour_user_review'
            )
        ]

    def __str__(self):
        return f'{self.user.email} - {self.tour.tour_name} ({self.rating}*)'
