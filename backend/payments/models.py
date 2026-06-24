import uuid

from django.conf import settings
from django.db import models


class PaymentConfig(models.Model):
    """Cấu hình thanh toán chỉnh được từ Django admin."""

    partner_premium_price_vnd = models.PositiveBigIntegerField(
        'Giá gói Partner Premium (VND)',
        default=100000,
        help_text='Giá mở khóa gói premium cho tài khoản partner.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'payment_config'
        verbose_name = 'Cấu hình thanh toán'
        verbose_name_plural = 'Cấu hình thanh toán'

    def save(self, *args, **kwargs):
        # Chỉ giữ một bản ghi cấu hình duy nhất.
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


def get_partner_premium_price_vnd() -> int:
    """Lấy giá partner premium từ cấu hình trong DB."""
    return int(PaymentConfig.get_solo().partner_premium_price_vnd or 0)


class Invoice(models.Model):
    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        SUCCESS = 'SUCCESS', 'Success'
        FAILED = 'FAILED', 'Failed'
        CANCELLED = 'CANCELLED', 'Cancelled'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoices',
    )

    reason = models.CharField(max_length=255, default='Đặt món ăn')
    amount = models.PositiveBigIntegerField(help_text='Số tiền VND')

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    transaction_code = models.CharField(max_length=100, blank=True, default='')
    paid_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'invoices'
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'Invoice {self.id} - {self.status} - {self.amount}'


class TourPurchase(models.Model):
    """Ghi nhận việc user mua tour premium."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='tour_purchases',
    )
    tour = models.ForeignKey(
        'tours.Tour',
        on_delete=models.CASCADE,
        related_name='purchases',
        verbose_name='Tour',
    )
    invoice = models.OneToOneField(
        Invoice,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tour_purchase',
    )
    purchased_at = models.DateTimeField('Ngày mua', auto_now_add=True)

    class Meta:
        db_table = 'tour_purchases'
        verbose_name = 'Mua Tour Premium'
        verbose_name_plural = 'Mua Tour Premium'
        ordering = ['-purchased_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'tour'],
                name='uniq_user_tour_purchase',
            ),
        ]

    def __str__(self) -> str:
        return f'{self.user} - {self.tour} ({self.purchased_at})'


class PartnerPremiumPurchase(models.Model):
    """Ghi nhận việc partner mua gói premium để mở khóa chỉnh sửa POI."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='partner_premium_purchases',
    )
    invoice = models.OneToOneField(
        Invoice,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='partner_premium_purchase',
    )
    purchased_at = models.DateTimeField('Ngày mua', auto_now_add=True)

    class Meta:
        db_table = 'partner_premium_purchases'
        verbose_name = 'Mua Premium Partner'
        verbose_name_plural = 'Mua Premium Partner'
        ordering = ['-purchased_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user'],
                name='uniq_user_partner_premium_purchase',
            ),
        ]

    def __str__(self) -> str:
        return f'{self.user} - Partner Premium ({self.purchased_at})'
