from rest_framework.permissions import BasePermission


def user_has_partner_portal_access(user) -> bool:
    """
    Được phép dùng cổng Partner nếu:
    - thuộc nhóm Django 'Partner', hoặc
    - đã có bản ghi Partner (pois.Partner) gắn OneToOne với user.

    Trường hợp admin tạo hồ sơ Partner và gắn user nhưng quên thêm group vẫn đăng nhập được.
    """
    if not user or not user.is_authenticated:
        return False
    if user.groups.filter(name='Partner').exists():
        return True
    from pois.models import Partner

    return Partner.objects.filter(user=user).exists()


def user_has_partner_premium_access(user) -> bool:
    """
    Partner premium access is granted after a successful premium purchase.
    """
    if not user or not user.is_authenticated:
        return False

    from payments.models import PartnerPremiumPurchase

    return PartnerPremiumPurchase.objects.filter(
        user=user,
        invoice__status='SUCCESS',
    ).exists()


class IsPartner(BasePermission):
    """
    Cho phép user có quyền cổng Partner (nhóm 'Partner' hoặc hồ sơ Partner đã gắn user).
    """

    def has_permission(self, request, view):
        return user_has_partner_portal_access(request.user)


class IsPartnerPremium(BasePermission):
    """
    Chỉ cho phép Partner đã mở khóa premium.
    """

    def has_permission(self, request, view):
        return user_has_partner_premium_access(request.user)


class IsPartnerOwner(BasePermission):
    """
    Chỉ cho phép Partner chính chủ sở hữu được sửa/xóa hồ sơ của mình.
    Dùng cho object-level permission khi kiểm tra Partner ownership.
    """

    def has_object_permission(self, request, view, obj):
        """obj là instance của Partner model."""
        return obj.user == request.user


class IsAdminOrReadOnly(BasePermission):
    """
    Admin (is_staff) có toàn quyền.
    User thường chỉ được đọc (GET, HEAD, OPTIONS).
    """
    SAFE_METHODS = ('GET', 'HEAD', 'OPTIONS')

    def has_permission(self, request, view):
        if request.method in self.SAFE_METHODS:
            return True
        return request.user and request.user.is_staff


class IsAdmin(BasePermission):
    """
    Chỉ cho phép Admin (is_staff) truy cập.
    Dùng cho các endpoint quản trị như duyệt nội dung Partner, xem analytics toàn hệ thống.
    """

    def has_permission(self, request, view):
        return request.user and request.user.is_staff
