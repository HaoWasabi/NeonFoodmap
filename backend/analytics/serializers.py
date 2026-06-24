from django.utils import timezone
from datetime import timedelta
from rest_framework import serializers

from .models import BreadcrumbLog, NarrationLog


# ---------------------------------------------------------------------------
# BreadcrumbLog serializers
# ---------------------------------------------------------------------------

class BreadcrumbPointSerializer(serializers.Serializer):
    """Validate một điểm GPS duy nhất trong batch."""
    lat = serializers.FloatField(
        min_value=-90, max_value=90,
        help_text='Vĩ độ (-90 đến 90)',
    )
    long = serializers.FloatField(
        min_value=-180, max_value=180,
        help_text='Kinh độ (-180 đến 180)',
    )
    timestamp = serializers.DateTimeField(
        help_text='ISO 8601, thời điểm thiết bị ghi điểm GPS',
    )


class BreadcrumbLogBatchSerializer(serializers.Serializer):
    """
    Nhận một mảng các điểm GPS từ client.
    Dùng bulk_create để insert hiệu quả.

    Request body:
    {
        "points": [
            {"lat": 10.776, "long": 106.700, "timestamp": "2026-03-14T10:00:00+07:00"},
            ...
        ]
    }
    """
    points = BreadcrumbPointSerializer(
        many=True,
        min_length=1,
        max_length=200,  # giới hạn mỗi batch tối đa 200 điểm
    )

    def create(self, validated_data):
        request = self.context['request']
        user = request.user if request.user.is_authenticated else None
        objs = [
            BreadcrumbLog(
                user=user,
                lat=point['lat'],
                long=point['long'],
                timestamp=point['timestamp'],
            )
            for point in validated_data['points']
        ]
        return BreadcrumbLog.objects.bulk_create(objs)


class BreadcrumbLogReadSerializer(serializers.ModelSerializer):
    """Serializer chỉ đọc, trả về một bản ghi BreadcrumbLog."""

    class Meta:
        model = BreadcrumbLog
        fields = ['id', 'lat', 'long', 'timestamp', 'status']


# ---------------------------------------------------------------------------
# NarrationLog serializers
# ---------------------------------------------------------------------------

class NarrationLogStartSerializer(serializers.ModelSerializer):
    """
    Gửi khi client bắt đầu phát một đoạn narration.
    Anti-spam logic nằm trong View, không phải ở đây.
    """

    class Meta:
        model = NarrationLog
        fields = ['poi', 'trigger_type', 'start_time']
        extra_kwargs = {
            'start_time': {
                'required': False,
                'help_text': 'Nếu không gửi, server sẽ dùng thời gian hiện tại.',
            },
        }

    def validate_trigger_type(self, value):
        allowed = [c[0] for c in NarrationLog.TriggerType.choices]
        if value not in allowed:
            raise serializers.ValidationError(
                f'trigger_type phải là một trong: {allowed}'
            )
        return value

    def create(self, validated_data):
        request = self.context['request']
        user = request.user if request.user.is_authenticated else None
        if 'start_time' not in validated_data:
            validated_data['start_time'] = timezone.now()
        return NarrationLog.objects.create(user=user, **validated_data)


class NarrationLogEndSerializer(serializers.ModelSerializer):
    """
    Gửi khi người dùng nghe xong, bấm dừng hoặc skip.
    Chỉ cập nhật trường duration (giây đã nghe).
    """
    duration = serializers.IntegerField(
        min_value=0,
        help_text='Số giây người dùng đã nghe thực tế.',
    )

    class Meta:
        model = NarrationLog
        fields = ['duration']


class NarrationLogReadSerializer(serializers.ModelSerializer):
    """Serializer đọc đầy đủ NarrationLog, dùng cho history endpoint."""

    poi_name = serializers.CharField(source='poi.name', read_only=True)
    trigger_type_display = serializers.CharField(
        source='get_trigger_type_display', read_only=True
    )

    class Meta:
        model = NarrationLog
        fields = [
            'id', 'poi', 'poi_name',
            'start_time', 'duration',
            'trigger_type', 'trigger_type_display',
            'status',
        ]
        read_only_fields = fields
