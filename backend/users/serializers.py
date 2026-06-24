from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()


class GuestLoginSerializer(serializers.Serializer):
    """Serializer nhận device_id để tạo/lấy tài khoản guest."""
    device_id = serializers.CharField(required=True)


class UpgradeGuestSerializer(serializers.Serializer):
    """Serializer để nâng cấp tài khoản guest thành tài khoản thường."""
    email = serializers.EmailField(required=True)
    password = serializers.CharField(
        write_only=True,
        min_length=8,
        validators=[validate_password],
        style={'input_type': 'password'}
    )
    password_confirm = serializers.CharField(
        write_only=True,
        style={'input_type': 'password'}
    )

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError(
                {'password_confirm': 'Mật khẩu xác nhận không khớp.'}
            )
        return attrs


class RegisterSerializer(serializers.ModelSerializer):
    """Serializer đăng ký tài khoản mới."""

    password = serializers.CharField(
        write_only=True,
        min_length=8,
        validators=[validate_password],
        style={'input_type': 'password'}
    )
    password_confirm = serializers.CharField(
        write_only=True,
        style={'input_type': 'password'}
    )

    class Meta:
        model = User
        fields = [
            'email', 'username', 'password', 'password_confirm',
            'first_name', 'last_name', 'phone_number',
            'preferred_language', 'preferred_voice_region',
        ]
        extra_kwargs = {
            'first_name': {'required': False},
            'last_name': {'required': False},
            'phone_number': {'required': False},
            'preferred_language': {'required': False},
            'preferred_voice_region': {'required': False},
        }

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError(
                {'password_confirm': 'Mật khẩu xác nhận không khớp.'}
            )
        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Mở rộng TokenObtainPairSerializer để thêm thông tin user vào response.
    """

    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = {
            'id': self.user.id,
            'email': self.user.email,
            'username': self.user.username,
            'full_name': self.user.get_full_name(),
            'preferred_language': self.user.preferred_language,
            'preferred_voice_region': self.user.preferred_voice_region,
        }
        return data


class UserProfileSerializer(serializers.ModelSerializer):
    """Serializer cho xem/cập nhật profile."""

    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'username', 'first_name', 'last_name',
            'full_name', 'phone_number', 'device_id',
            'preferred_language', 'preferred_voice_region',
            'status', 'date_joined', 'last_login',
        ]
        read_only_fields = ['id', 'email', 'status', 'date_joined', 'last_login']

    def get_full_name(self, obj):
        return obj.get_full_name()


class ChangePasswordSerializer(serializers.Serializer):
    """Serializer đổi mật khẩu."""

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
