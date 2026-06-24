from rest_framework import serializers
from django.db.models import Max, Avg
from .models import Tour, Tour_POI, TourReview
from pois.serializers import POIListSerializer
from payments.models import TourPurchase


class TourPOIInlineSerializer(serializers.ModelSerializer):
    """Serializer gọn cho POI bên trong Tour payload."""
    poi = POIListSerializer(read_only=True)

    class Meta:
        model = Tour_POI
        fields = ['poi', 'sequence_order']


class TourSerializer(serializers.ModelSerializer):
    """Serializer cho model Tour."""
    name = serializers.CharField(source='tour_name')
    pois = serializers.SerializerMethodField()
    average_rating = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()
    is_unlocked = serializers.SerializerMethodField()

    def get_pois(self, obj):
        mappings = (
            obj.tour_pois
            .filter(status=Tour_POI.Status.ACTIVE, poi__status=1)
            .select_related('poi')
            .order_by('sequence_order')
        )
        return TourPOIInlineSerializer(mappings, many=True, context=self.context).data

    def get_average_rating(self, obj):
        return obj.reviews.aggregate(Avg('rating'))['rating__avg'] or 0.0

    def get_review_count(self, obj):
        return obj.reviews.count()

    def get_is_unlocked(self, obj):
        """Premium tour cần mua mới unlock; tour thường luôn True."""
        if not obj.is_premium:
            return True
        request = self.context.get('request')
        if not request or not getattr(request.user, 'is_authenticated', False):
            return False
        return TourPurchase.objects.filter(
            user=request.user,
            tour=obj,
            invoice__status='SUCCESS',
        ).exists()

    class Meta:
        model = Tour
        fields = [
            'id',
            'name',
            'translated_name',
            'description',
            'translated_description',
            'status',
            'is_suggested',
            'is_premium',
            'premium_price',
            'estimated_duration_min',
            'pois',
            'created_by',
            'average_rating',
            'review_count',
            'is_unlocked',
        ]
        read_only_fields = ['id', 'created_by', 'pois', 'average_rating', 'review_count', 'is_unlocked']


class TourPOISerializer(serializers.ModelSerializer):
    """Serializer cho model Tour_POI."""
    sequence_order = serializers.IntegerField(required=False, min_value=1)

    def validate(self, attrs):
        """
        - Cho phép đổi sequence_order khi edit, miễn không trùng trong cùng tour.
        - Không cho phép trùng POI trong cùng tour.
        """
        tour = attrs.get('tour') or getattr(self.instance, 'tour', None)
        poi = attrs.get('poi') or getattr(self.instance, 'poi', None)
        sequence_order = attrs.get('sequence_order') or getattr(self.instance, 'sequence_order', None)

        if tour and poi:
            qs = Tour_POI.objects.filter(tour=tour, poi=poi)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({
                    'poi': 'POI này đã tồn tại trong tour. Vui lòng chọn POI khác.'
                })

        if tour and sequence_order:
            qs = Tour_POI.objects.filter(tour=tour, sequence_order=sequence_order)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({
                    'sequence_order': 'sequence_order đã tồn tại trong tour này. Vui lòng chọn giá trị khác.'
                })

        return attrs

    def create(self, validated_data):
        # Nếu không truyền sequence_order, tự động max+1 (đồng bộ với model.save)
        if 'sequence_order' not in validated_data:
            tour = validated_data['tour']
            max_order = Tour_POI.objects.filter(tour=tour).aggregate(m=Max('sequence_order')).get('m')
            validated_data['sequence_order'] = (max_order or 0) + 1
        return super().create(validated_data)

    class Meta:
        model = Tour_POI
        fields = [
            'id', 'tour', 'poi', 'sequence_order', 'status'
        ]
        read_only_fields = ['id']


class TourReviewSerializer(serializers.ModelSerializer):
    """Serializer cho model TourReview."""
    tour = serializers.PrimaryKeyRelatedField(queryset=Tour.objects.all())
    user_email = serializers.EmailField(source='user.email', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = TourReview
        fields = [
            'id', 'tour', 'user', 'user_email', 'username', 
            'rating', 'comment', 'created_at'
        ]
        read_only_fields = ['id', 'user', 'created_at']

