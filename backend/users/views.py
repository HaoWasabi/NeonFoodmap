import uuid
from django.contrib.auth import get_user_model
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .serializers import (
    ChangePasswordSerializer,
    CustomTokenObtainPairSerializer,
    RegisterSerializer,
    UserProfileSerializer,
    GuestLoginSerializer,
    UpgradeGuestSerializer,
)

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    """
    POST /api/users/register/
    Đăng ký tài khoản mới. Trả về JWT tokens + thông tin user.
    """
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # Tạo JWT tokens cho user vừa đăng ký
        refresh = RefreshToken.for_user(user)

        return Response({
            'message': 'Đăng ký thành công!',
            'tokens': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            },
            'user': {
                'id': user.id,
                'email': user.email,
                'username': user.username,
                'full_name': user.get_full_name(),
            }
        }, status=status.HTTP_201_CREATED)


class CustomTokenObtainPairView(TokenObtainPairView):
    """
    POST /api/users/login/
    Đăng nhập bằng email + password, trả về JWT access + refresh + user info.
    """
    serializer_class = CustomTokenObtainPairSerializer


class UpgradeGuestView(APIView):
    """
    POST /api/users/upgrade-guest/
    Nâng cấp tài khoản guest thành tài khoản thường (thêm email, password).
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = UpgradeGuestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_email = serializer.validated_data['email']
        new_password = serializer.validated_data['password']
        device_id = (request.data.get('device_id') or '').strip()

        # If email already exists, frontend should send user to login flow.
        if User.objects.filter(email__iexact=new_email).exists():
            return Response(
                {
                    'code': 'EMAIL_EXISTS',
                    'error': 'Email này đã được sử dụng. Vui lòng đăng nhập.',
                },
                status=status.HTTP_409_CONFLICT,
            )

        user = None
        if request.user.is_authenticated:
            user = request.user
            if not user.email.endswith('@guest.bcsd.local'):
                return Response(
                    {'error': 'Tài khoản này không phải là tài khoản Guest.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            if not device_id:
                return Response(
                    {'error': 'device_id is required for guest upgrade.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            user = User.objects.filter(
                device_id=device_id,
                email__endswith='@guest.bcsd.local'
            ).first()
            if not user:
                return Response(
                    {'error': 'Không tìm thấy tài khoản Guest cho thiết bị này.'},
                    status=status.HTTP_404_NOT_FOUND
                )

        user.email = new_email
        user.set_password(new_password)
        user.save()

        # Generate new tokens
        refresh = RefreshToken.for_user(user)

        return Response({
            'message': 'Nâng cấp tài khoản thành công!',
            'tokens': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            },
            'user': {
                'id': user.id,
                'email': user.email,
                'username': user.username,
                'full_name': user.get_full_name(),
            }
        }, status=status.HTTP_200_OK)


class UserProfileView(generics.RetrieveUpdateAPIView):
    """
    GET /api/users/profile/     - Xem profile
    PUT /api/users/profile/     - Cập nhật toàn bộ profile
    PATCH /api/users/profile/   - Cập nhật một phần profile
    """
    serializer_class = UserProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


class ChangePasswordView(APIView):
    """
    POST /api/users/change-password/
    Đổi mật khẩu (yêu cầu old_password + new_password + new_password_confirm).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data,
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)

        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save()

        return Response(
            {'message': 'Đổi mật khẩu thành công!'},
            status=status.HTTP_200_OK
        )


class LogoutView(APIView):
    """
    POST /api/users/logout/
    Blacklist refresh token để đăng xuất.
    Body: { "refresh": "<refresh_token>" }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            if not refresh_token:
                return Response(
                    {'error': 'Vui lòng cung cấp refresh token.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response(
                {'message': 'Đăng xuất thành công!'},
                status=status.HTTP_200_OK
            )
        except Exception:
            return Response(
                {'error': 'Token không hợp lệ hoặc đã hết hạn.'},
                status=status.HTTP_400_BAD_REQUEST
            )


class GuestLoginView(APIView):
    """
    POST /api/users/guest-login/
    Đăng nhập hoặc tạo mới tài khoản guest dựa vào device_id.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = GuestLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        device_id = serializer.validated_data['device_id']

        # Tìm user có device_id này và email có đuôi @guest.bcsd.local
        user = User.objects.filter(device_id=device_id, email__endswith='@guest.bcsd.local').first()

        if not user:
            # Tạo mới
            short_uuid = uuid.uuid4().hex[:8]
            guest_email = f"guest_{short_uuid}_{device_id[-4:]}@guest.bcsd.local"
            guest_username = f"guest_{short_uuid}"
            
            # Đảm bảo email duy nhất (rất hiếm khi trùng, nhưng cứ phòng hờ)
            while User.objects.filter(email=guest_email).exists():
                short_uuid = uuid.uuid4().hex[:8]
                guest_email = f"guest_{short_uuid}_{device_id[-4:]}@guest.bcsd.local"

            user = User.objects.create_user(
                username=guest_username,
                email=guest_email,
                password=uuid.uuid4().hex, # Mật khẩu random không ai biết, không quan trọng
                device_id=device_id
            )

        refresh = RefreshToken.for_user(user)

        return Response({
            'message': 'Đăng nhập Guest thành công!',
            'tokens': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            },
            'user': {
                'id': user.id,
                'email': user.email,
                'username': user.username,
                'full_name': user.get_full_name(),
                'device_id': user.device_id,
            }
        }, status=status.HTTP_200_OK)
