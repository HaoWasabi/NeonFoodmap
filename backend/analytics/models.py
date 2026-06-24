from django.conf import settings
from django.db import models


class BreadcrumbLog(models.Model):
    """
    Lưu vết tọa độ GPS của người dùng theo thời gian.
    Dữ liệu được thiết bị gOM nhóm rồi gửi batch về server.
    Dùng để vẽ Heatmap và thống kê mật độ du khách.
    """

    class Status(models.IntegerChoices):
        INACTIVE = 0, 'Không hoạt động'
        ACTIVE = 1, 'Hoạt động'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='breadcrumbs',
        verbose_name='Người dùng',
    )
    lat = models.FloatField('Vĩ độ')
    long = models.FloatField('Kinh độ')
    # timestamp do client gửi lên (ghi nhận thời điểm ghi điểm, không phải lúc server nhận)
    timestamp = models.DateTimeField('Thời điểm ghi')
    status = models.IntegerField(
        'Trạng thái',
        choices=Status.choices,
        default=Status.ACTIVE,
    )

    class Meta:
        db_table = 'breadcrumb_logs'
        verbose_name = 'Vết di chuyển'
        verbose_name_plural = 'Vết di chuyển'
        ordering = ['timestamp']
        indexes = [
            models.Index(fields=['user', 'timestamp'], name='breadcrumb_user_ts_idx'),
        ]

    def __str__(self):
        return f'[{self.user_id}] ({self.lat}, {self.long}) @ {self.timestamp}'


class NarrationLog(models.Model):
    """
    Lịch sử các đoạn audio/nội dung mà người dùng đã nghe.
    Đóng vai trò then chốt cho Narration Engine:
    - Tránh phát lặp lại (Anti-Spam Rule: 30 phút / trigger AUTO)
    - QR trigger luôn phát, bỏ qua Anti-Spam
    - Analytics tính % lắng nghe thực tế
    """

    class TriggerType(models.TextChoices):
        AUTO = 'AUTO', 'Tự động (Geofence)'
        QR = 'QR', 'Quét mã QR'

    class Status(models.IntegerChoices):
        INACTIVE = 0, 'Không hoạt động'
        ACTIVE = 1, 'Hoạt động'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='narration_logs',
        verbose_name='Người dùng',
    )
    poi = models.ForeignKey(
        'pois.POI',
        on_delete=models.CASCADE,
        related_name='narration_logs',
        verbose_name='Điểm tham quan',
    )
    start_time = models.DateTimeField('Thời điểm bắt đầu')
    # duration tính bằng giây; null khi mới start, được điền khi end/skip
    duration = models.IntegerField(
        'Thời lượng đã nghe (giây)',
        null=True,
        blank=True,
        help_text='Null cho đến khi client gửi end event.',
    )
    trigger_type = models.CharField(
        'Loại kích hoạt',
        max_length=10,
        choices=TriggerType.choices,
        default=TriggerType.AUTO,
    )
    status = models.IntegerField(
        'Trạng thái',
        choices=Status.choices,
        default=Status.ACTIVE,
    )

    class Meta:
        db_table = 'narration_logs'
        verbose_name = 'Lịch sử nghe'
        verbose_name_plural = 'Lịch sử nghe'
        ordering = ['-start_time']
        indexes = [
            # Index phục vụ Anti-Spam query: user + poi + trigger + start_time
            models.Index(
                fields=['user', 'poi', 'trigger_type', 'start_time'],
                name='narration_antispam_idx',
            ),
        ]

    def __str__(self):
        return (
            f'[{self.user_id}] POI#{self.poi_id} '
            f'({self.trigger_type}) @ {self.start_time}'
        )
