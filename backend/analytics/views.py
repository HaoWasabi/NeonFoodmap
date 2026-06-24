from datetime import timedelta

from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import BreadcrumbLog, NarrationLog
from .serializers import (
    BreadcrumbLogBatchSerializer,
    BreadcrumbLogReadSerializer,
    NarrationLogEndSerializer,
    NarrationLogReadSerializer,
    NarrationLogStartSerializer,
)

# Nghiệp vụ: Anti-Spam window (phút)
ANTI_SPAM_MINUTES = 5


# ---------------------------------------------------------------------------
# BreadcrumbLog Views
# ---------------------------------------------------------------------------

class BreadcrumbBatchCreateView(APIView):
    """
    POST /api/analytics/breadcrumbs/batch/

    Nhận mảng điểm GPS từ thiết bị và lưu hàng loạt vào DB.
    Client gOM nhóm điểm (mỗi 15-30 giây) rồi gửi một lần để tiết kiệm request.

    Request body:
    {
        "points": [
            {"lat": 10.776, "long": 106.700, "timestamp": "2026-03-14T10:00:00+07:00"},
            ...
        ]
    }
    Response 201:
    {
        "message": "Đã lưu 3 điểm GPS.",
        "count": 3
    }
    """
    permission_classes = [AllowAny]  # Anonymous users cũng được ghi breadcrumb

    def post(self, request):
        serializer = BreadcrumbLogBatchSerializer(
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        created = serializer.save()
        return Response(
            {
                'message': f'Đã lưu {len(created)} điểm GPS.',
                'count': len(created),
            },
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# NarrationLog Views
# ---------------------------------------------------------------------------

class NarrationStartView(APIView):
    """
    POST /api/analytics/narration/start/

    Gọi khi hệ thống bắt đầu phát một đoạn narration.

    **Anti-Spam Rule** (trigger_type = AUTO):
    Nếu trong vòng 30 phút qua user đã có NarrationLog cho cùng POI
    với trigger AUTO → trả về {should_play: false} và KHÔNG tạo record.

    **QR Override Rule** (trigger_type = QR):
    Bỏ qua Anti-Spam, tạo record và phát ngay lập tức.

    Request body: { "poi": <id>, "trigger_type": "AUTO"|"QR", "start_time": "..." }
    Response 201 (tạo record):  { "should_play": true, "log": {...} }
    Response 200 (bị chặn):     { "should_play": false, "reason": "..." }
    """
    permission_classes = [AllowAny]  # Anonymous users cũng được trigger narration

    def post(self, request):
        serializer = NarrationLogStartSerializer(
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)

        trigger_type = serializer.validated_data.get('trigger_type', NarrationLog.TriggerType.AUTO)
        poi = serializer.validated_data['poi']

        # ----------------------------------------------------------------
        # Anti-Spam check (chỉ áp dụng cho trigger AUTO và user đã đăng nhập)
        # ----------------------------------------------------------------
        if trigger_type == NarrationLog.TriggerType.AUTO and request.user.is_authenticated:
            cutoff = timezone.now() - timedelta(minutes=ANTI_SPAM_MINUTES)
            already_played = NarrationLog.objects.filter(
                user=request.user,
                poi=poi,
                trigger_type=NarrationLog.TriggerType.AUTO,
                start_time__gte=cutoff,
                status=NarrationLog.Status.ACTIVE,
            ).exists()

            if already_played:
                return Response(
                    {
                        'should_play': False,
                        'reason': (
                            f'Người dùng đã nghe nội dung này trong vòng '
                            f'{ANTI_SPAM_MINUTES} phút qua.'
                        ),
                    },
                    status=status.HTTP_200_OK,
                )

        # ----------------------------------------------------------------
        # Tạo record NarrationLog mới
        # ----------------------------------------------------------------
        log = serializer.save()
        read_serializer = NarrationLogReadSerializer(log)
        return Response(
            {
                'should_play': True,
                'log': read_serializer.data,
            },
            status=status.HTTP_201_CREATED,
        )


class NarrationEndView(generics.UpdateAPIView):
    """
    PATCH /api/analytics/narration/<id>/end/

    Cập nhật số giây người dùng đã nghe thực tế (duration).
    Được gọi khi audio kết thúc, user bấm dừng hoặc skip.

    Request body: { "duration": 45 }
    """
    serializer_class = NarrationLogEndSerializer
    permission_classes = [AllowAny]  # Anonymous users cũng được gửi end event
    http_method_names = ['patch']

    def get_queryset(self):
        # Nếu đã đăng nhập, chỉ cho phép update log của chính mình
        if self.request.user.is_authenticated:
            return NarrationLog.objects.filter(user=self.request.user)
        # Anonymous: lọc theo log không có user (chỉ update log của guest)
        return NarrationLog.objects.filter(user__isnull=True)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        read_serializer = NarrationLogReadSerializer(instance)
        return Response(read_serializer.data, status=status.HTTP_200_OK)


class NarrationHistoryView(generics.ListAPIView):
    """
    GET /api/analytics/narration/history/

    Trả về lịch sử nghe của user hiện tại, mới nhất trước.
    Hỗ trợ phân trang theo PAGE_SIZE trong settings.
    Query params: ?trigger_type=AUTO|QR  (tuỳ chọn để lọc)
    """
    serializer_class = NarrationLogReadSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = NarrationLog.objects.filter(
            user=self.request.user,
            status=NarrationLog.Status.ACTIVE,
        ).select_related('poi')

        trigger_type = self.request.query_params.get('trigger_type')
        if trigger_type:
            qs = qs.filter(trigger_type=trigger_type.upper())

        return qs
