from rest_framework import serializers
from .models import Media, POI, PartnerIntroMedia
from partners.serializers import PartnerSerializer


class MediaSerializer(serializers.ModelSerializer):
    media_type_display = serializers.CharField(source='get_media_type_display', read_only=True)

    class Meta:
        model = Media
        fields = [
            'id', 'language', 'voice_region',
            'file_url', 'tts_content', 'media_type', 'media_type_display',
        ]


class MediaCRUDSerializer(serializers.ModelSerializer):
    media_type_display = serializers.CharField(source='get_media_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Media
        fields = [
            'id', 'poi',
            'language', 'voice_region',
            'file_url', 'tts_content', 'media_type', 'media_type_display',
            'status', 'status_display',
        ]


class POIListSerializer(serializers.ModelSerializer):
    """
    Serializer nhẹ cho near-me và scan — không embed media/partners
    để giảm payload khi trả về danh sách.
    """
    translated_name = serializers.SerializerMethodField()
    translated_description = serializers.SerializerMethodField()
    distance = serializers.FloatField(read_only=True, default=None)

    class Meta:
        model = POI
        fields = [
            'id', 'name', 'translated_name', 'description', 'translated_description',
            'latitude', 'longitude', 'geofence_radius',
            'category', 'cover_image_url', 'qr_code_data', 'status',
            'created_at', 'updated_at',
            'distance',
        ]
        validators = []  # Vô hiệu hoá auto-validator của DRF để tránh KeyError trong partial update. Logic đã được check trong view và model.

    def get_translated_name(self, obj):
        request = self.context.get('request')
        if not request:
            return obj.name
        
        lang = request.query_params.get('language')
        if not lang:
            accept_lang = request.headers.get('Accept-Language', 'vi')
            lang = accept_lang.split(',')[0].split('-')[0].lower()

        if lang == 'vi':
            return obj.name
        
        media_list = getattr(obj, '_prefetched_media_cache', obj.media.all())
        for m in media_list:
            if m.language == lang and m.translated_name:
                return m.translated_name
        return obj.name

    def get_translated_description(self, obj):
        request = self.context.get('request')
        if not request:
            return obj.description
        
        # Priority: Query param > Accept-Language header > Default 'vi'
        lang = request.query_params.get('language')
        if not lang:
            # Note: headers.get returns the raw Value (e.g. 'en-US,en;q=0.9'). 
            # For simplicity, we take the first 2 chars or check if it starts with known codes.
            accept_lang = request.headers.get('Accept-Language', 'vi')
            lang = accept_lang.split(',')[0].split('-')[0].lower()

        if lang == 'vi':
            return obj.description
        
        # Tìm bản dịch trong media (đã được prefetch nếu gọi từ POINearMeView)
        media_list = getattr(obj, '_prefetched_media_cache', obj.media.all())
        for m in media_list:
            if m.language == lang and m.tts_content:
                return m.tts_content
        return obj.description


class POIDetailSerializer(serializers.ModelSerializer):
    """Serializer đầy đủ cho GET /pois/<id>/ — embed media + partners."""
    media = MediaSerializer(many=True, read_only=True)
    partners = PartnerSerializer(many=True, read_only=True)
    translated_name = serializers.SerializerMethodField()
    translated_description = serializers.SerializerMethodField()

    class Meta:
        model = POI
        fields = [
            'id', 'name', 'translated_name', 'description', 'translated_description',
            'latitude', 'longitude', 'geofence_radius',
            'category', 'cover_image_url', 'qr_code_data', 'status',
            'created_at', 'updated_at',
            'media', 'partners',
        ]
        validators = []

    def get_translated_name(self, obj):
        request = self.context.get('request')
        if not request:
            return obj.name
        
        lang = request.query_params.get('language')
        if not lang:
            accept_lang = request.headers.get('Accept-Language', 'vi')
            lang = accept_lang.split(',')[0].split('-')[0].lower()

        if lang == 'vi':
            return obj.name
        
        for m in obj.media.all():
            if m.language == lang and m.translated_name:
                return m.translated_name
        return obj.name

    def get_translated_description(self, obj):
        request = self.context.get('request')
        if not request:
            return obj.description
        
        lang = request.query_params.get('language')
        if not lang:
            accept_lang = request.headers.get('Accept-Language', 'vi')
            lang = accept_lang.split(',')[0].split('-')[0].lower()

        if lang == 'vi':
            return obj.description
        
        # Vì DetailView đã prefetch media nên media.all() không gây N+1
        for m in obj.media.all():
            if m.language == lang and m.tts_content:
                return m.tts_content
        return obj.description


# ==================== Partner Serializers ====================


class PartnerIntroMediaSerializer(serializers.ModelSerializer):
    """
    Serializer cho quản lý file audio giới thiệu của Partner.
    Liên kết với file media từ core/models.py.
    """
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = PartnerIntroMedia
        fields = [
            'id', 'partner', 'media_id',
            'language', 'voice_region',
            'status', 'status_display',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']
