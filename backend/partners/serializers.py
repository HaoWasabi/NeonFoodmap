from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from payments.models import get_partner_premium_price_vnd

from users.permissions import user_has_partner_portal_access
from users.permissions import user_has_partner_premium_access

from .models import Partner

User = get_user_model()


class PartnerSerializer(serializers.ModelSerializer):
    translated_intro_text = serializers.SerializerMethodField()

    class Meta:
        model = Partner
        fields = [
            'id', 'business_name', 'address', 'intro_text', 
            'translated_intro_text', 'qr_url', 'menu_details', 'opening_hours'
        ]

    def get_translated_intro_text(self, obj):
        request = self.context.get('request')
        if not request:
            return obj.intro_text
        
        lang = request.query_params.get('language')
        if not lang:
            accept_lang = request.headers.get('Accept-Language', 'vi')
            lang = accept_lang.split(',')[0].split('-')[0].lower()

        if lang == 'vi':
            return obj.intro_text
        
        # PartnerIntroMedia is related via 'intro_media'
        # We can't easily prefetch here without changing the calling view,
        # but for a single POI detail it's fine.
        intro = obj.intro_media.filter(language=lang, status=1).first()
        if intro:
            # Note: PartnerIntroMedia references a media_id. 
            # If we want the text, we might need to look up the Media model or 
            # if we added a text field to PartnerIntroMedia later.
            # Wait, looking at models.py again.
            pass
        
        return obj.intro_text


class PartnerCRUDSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Partner
        fields = [
            'id',
            'user',
            'poi',
            'business_name',
            'address',
            'intro_text',
            'qr_url',
            'menu_details',
            'opening_hours',
            'status',
            'status_display',
        ]
        read_only_fields = ['user']
        extra_kwargs = {
            'poi': {'required': False, 'allow_null': True},
        }


class PartnerRegisterSerializer(serializers.Serializer):
    """
    Mở cổng Partner cho user đã có tài khoản ứng dụng: xác thực bằng email *hoặc* username + mật khẩu,
    đồng thời tạo/cập nhật bản ghi Partner với thông tin cơ sở gửi lên. Không tạo User mới.
    """

    identifier = serializers.CharField(
        max_length=254,
        help_text='Email đăng nhập app hoặc tên đăng nhập (username).',
    )
    password = serializers.CharField(write_only=True, style={'input_type': 'password'})
    password_confirm = serializers.CharField(write_only=True, style={'input_type': 'password'})

    business_name = serializers.CharField(max_length=255)
    address = serializers.CharField(required=False, allow_blank=True, default='')
    intro_text = serializers.CharField(required=False, allow_blank=True, default='')
    opening_hours = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError(
                {'password_confirm': 'Mật khẩu xác nhận không khớp.'}
            )

        raw = (attrs.get('identifier') or '').strip()
        if not raw:
            raise serializers.ValidationError(
                {'identifier': 'Vui lòng nhập email hoặc tên đăng nhập (username).'}
            )

        user = User.objects.filter(email__iexact=raw).first()
        if not user:
            user = User.objects.filter(username__iexact=raw).first()
        if not user:
            raise serializers.ValidationError(
                {
                    'identifier': (
                        'Không tìm thấy tài khoản người dùng với email hoặc username này. '
                        'Hãy đăng ký tài khoản ứng dụng trước, sau đó quay lại để kích hoạt cổng Partner.'
                    )
                }
            )

        if not user.check_password(attrs['password']):
            raise serializers.ValidationError(
                {
                    'password': (
                        'Mật khẩu không đúng với tài khoản người dùng. '
                        'Hãy nhập đúng mật khẩu bạn dùng khi đăng nhập app.'
                    )
                }
            )

        if user_has_partner_portal_access(user):
            raise serializers.ValidationError(
                {
                    'identifier': (
                        'Tài khoản này đã có quyền Partner. '
                        'Vui lòng đăng nhập cổng đối tác thay vì đăng ký lại.'
                    )
                }
            )

        bn = (attrs.get('business_name') or '').strip()
        if not bn:
            raise serializers.ValidationError(
                {'business_name': 'Vui lòng nhập tên cơ sở / quán.'}
            )

        self._partner_link_user = user
        return attrs

    def create(self, validated_data):
        user = self._partner_link_user

        partner_group, _ = Group.objects.get_or_create(name='Partner')
        user.groups.add(partner_group)

        validated_data.pop('password', None)
        validated_data.pop('password_confirm', None)
        validated_data.pop('identifier', None)

        business_name = (validated_data.pop('business_name') or '').strip()[:255]
        address = (validated_data.pop('address', '') or '').strip()
        intro_text = (validated_data.pop('intro_text', '') or '').strip()
        opening_hours = (validated_data.pop('opening_hours', '') or '').strip()

        Partner.objects.update_or_create(
            user=user,
            defaults={
                'business_name': business_name,
                'address': address,
                'intro_text': intro_text,
                'opening_hours': opening_hours,
                'status': Partner.Status.PENDING_APPROVAL,
            },
        )

        return user


class PartnerTokenObtainPairSerializer(TokenObtainPairSerializer):
    """JWT login serializer cho Partner actor — đăng nhập bằng email hoặc username (trường identifier)."""

    identifier = serializers.CharField(required=False, allow_blank=True, write_only=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # TokenObtainSerializer luôn đặt USERNAME_FIELD (email) là bắt buộc; ta cho phép chỉ gửi identifier + password.
        uf = User.USERNAME_FIELD
        if uf in self.fields:
            self.fields[uf].required = False
            self.fields[uf].allow_blank = True

    def validate(self, attrs):
        identifier = (attrs.pop('identifier', None) or '').strip()
        uf = User.USERNAME_FIELD
        email_or_username = (attrs.get(uf) or '').strip()

        if identifier and not email_or_username:
            user = User.objects.filter(email__iexact=identifier).first()
            if not user:
                user = User.objects.filter(username__iexact=identifier).first()
            if user:
                attrs[uf] = user.email
            else:
                raise serializers.ValidationError(
                    {
                        'identifier': (
                            'Không tìm thấy tài khoản với email hoặc username này.'
                        )
                    }
                )
        elif not (attrs.get(uf) or '').strip():
            raise serializers.ValidationError(
                {
                    'identifier': (
                        'Thiếu email/username: gửi JSON { "identifier": "email hoặc username", "password": "..." } '
                        'hoặc { "email": "...", "password": "..." }.'
                    )
                }
            )

        data = super().validate(attrs)
        if not user_has_partner_portal_access(self.user):
            raise serializers.ValidationError(
                {
                    'detail': (
                        'Tài khoản chưa có quyền cổng Partner. '
                        'Cần hồ sơ đối tác đã gắn với email này hoặc thuộc nhóm Partner.'
                    )
                }
            )

        # Đồng bộ nhóm Django cho tài khoản đã có Partner nhưng admin chưa thêm group.
        if not self.user.groups.filter(name='Partner').exists():
            partner_group, _ = Group.objects.get_or_create(name='Partner')
            self.user.groups.add(partner_group)

        data['user'] = {
            'id': self.user.id,
            'email': self.user.email,
            'username': self.user.username,
            'full_name': self.user.get_full_name(),
            'preferred_language': self.user.preferred_language,
            'preferred_voice_region': self.user.preferred_voice_region,
            'roles': list(self.user.groups.values_list('name', flat=True)),
        }
        return data


class PartnerProfileSerializer(serializers.ModelSerializer):
    """
    Serializer cho CRUD business profile của Partner.
    Endpoint: /api/partners/account/profile/
    """

    menu_details = serializers.JSONField(required=False)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    poi_created_at = serializers.SerializerMethodField()
    poi_updated_at = serializers.SerializerMethodField()
    is_premium_unlocked = serializers.SerializerMethodField()
    premium_price = serializers.SerializerMethodField()

    class Meta:
        model = Partner
        fields = [
            'id',
            'business_name',
            'address',
            'intro_text',
            'qr_url',
            'menu_details',
            'opening_hours',
            'poi',
            'status',
            'status_display',
            'is_premium_unlocked',
            'premium_price',
            'created_at',
            'updated_at',
            'poi_created_at',
            'poi_updated_at',
        ]
        extra_kwargs = {
            'poi': {'required': False, 'allow_null': True},
            'qr_url': {'required': False, 'allow_blank': True},
            'menu_details': {'required': False},
            'created_at': {'read_only': True},
            'updated_at': {'read_only': True},
        }

    def get_poi_created_at(self, obj):
        if obj.poi_id and getattr(obj, 'poi', None):
            return obj.poi.created_at
        return None

    def get_poi_updated_at(self, obj):
        if obj.poi_id and getattr(obj, 'poi', None):
            return obj.poi.updated_at
        return None

    def get_is_premium_unlocked(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        if user and getattr(user, 'id', None) == getattr(obj, 'user_id', None):
            return user_has_partner_premium_access(user)
        return False

    def get_premium_price(self, obj):
        return get_partner_premium_price_vnd()


class PartnerChangePasswordSerializer(serializers.Serializer):
    """Serializer đổi mật khẩu cho Partner account."""

    old_password = serializers.CharField(
        required=True,
        style={'input_type': 'password'}
    )
    new_password = serializers.CharField(
        required=True,
        min_length=8,
        validators=[validate_password],
        style={'input_type': 'password'}
    )
    new_password_confirm = serializers.CharField(
        required=True,
        style={'input_type': 'password'}
    )

    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Mật khẩu cũ không đúng.')
        return value

    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError(
                {'new_password_confirm': 'Mật khẩu xác nhận không khớp.'}
            )
        return attrs
