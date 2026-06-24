"""
Management command: seed_demo
Tạo dữ liệu mẫu (POI + Partner) để demo tính năng QR và narration.

Usage:
    python manage.py seed_demo
    python manage.py seed_demo --lat 10.7552 --lng 106.7038   # toạ độ tuỳ chỉnh
    python manage.py seed_demo --clear                          # xoá data demo trước khi tạo lại
"""
from django.core.management.base import BaseCommand
from pois.models import POI, Partner


DEMO_POI_QR = 'BCSD-POI-001'  # phải khớp với handleTestScan() trong QRScanOverlay.tsx

DEMO_DATA = {
    'poi': {
        'name': '🍜 Phố Ẩm Thực Vĩnh Khánh',
        'description': (
            'Vĩnh Khánh là con phố ẩm thực nổi tiếng bậc nhất Quận 4, TP. HCM. '
            'Nơi đây quy tụ hàng trăm quán ăn đặc sản từ hải sản tươi sống, '
            'bún bò, hủ tiếu cho đến các món ăn vặt đường phố. '
            'Không khí nhộn nhịp từ sáng đến đêm khuya thu hút cả người dân địa phương '
            'lẫn du khách thập phương.'
        ),
        'category': 'food',
        'status': POI.Status.ACTIVE,
        'qr_code_data': DEMO_POI_QR,
        'geofence_radius': 200,
    },
    'partners': [
        {
            'business_name': 'Hải Sản Năm Phước',
            'intro_text': (
                'Chào mừng bạn đến Hải Sản Năm Phước! Quán chúng tôi chuyên '
                'các món hải sản tươi sống nguyên con, đặc biệt là ghẹ rang me '
                'và mực nhồi thịt hấp. Giá cả hợp lý, phục vụ từ 10 giờ sáng đến 11 giờ đêm.'
            ),
            'opening_hours': '10:00 - 23:00',
            'qr_url': 'https://maps.app.goo.gl/demo-hai-san',
            'menu_details': {
                'must_try': ['Ghẹ rang me', 'Mực nhồi thịt hấp', 'Tôm nướng muối ớt'],
                'price_range': '150k - 500k',
            },
        },
        {
            'business_name': 'Bún Bò Huế Dì Tám',
            'intro_text': (
                'Bún Bò Huế Dì Tám — hơn 30 năm giữ nguyên hương vị truyền thống. '
                'Nước dùng hầm xương bò 12 tiếng, cay đậm đà, ăn kèm rau sống tươi. '
                'Quán mở từ 6 giờ sáng, thường hết hàng trước 10 giờ!'
            ),
            'opening_hours': '06:00 - 10:00',
            'qr_url': '',  # demo QR tự động từ ID
            'menu_details': {
                'must_try': ['Bún bò đặc biệt', 'Bún giò heo', 'Bánh mì chấm'],
                'price_range': '40k - 80k',
            },
        },
        {
            'business_name': 'Chè Thái Cô Lan',
            'intro_text': (
                'Giải nhiệt ngay với ly chè Thái mát lạnh của Cô Lan! '
                'Topping phong phú: thạch dừa, trân châu, đậu đỏ, kem béo. '
                'Chỉ 25.000đ một ly lớn, phục vụ cả ngày.'
            ),
            'opening_hours': '08:00 - 22:00',
            'qr_url': 'https://facebook.com/demo-che-thai',
            'menu_details': {
                'must_try': ['Chè Thái đặc biệt', 'Trà sữa trân châu', 'Sinh tố bơ'],
                'price_range': '20k - 45k',
            },
        },
    ],
}


class Command(BaseCommand):
    help = 'Tạo dữ liệu demo gồm 1 POI + 3 Partner để test tính năng QR và Narration'

    def add_arguments(self, parser):
        parser.add_argument('--lat', type=float, default=10.7552, help='Vĩ độ của POI demo')
        parser.add_argument('--lng', type=float, default=106.7038, help='Kinh độ của POI demo')
        parser.add_argument('--clear', action='store_true', help='Xoá POI demo cũ trước khi tạo mới')

    def handle(self, *args, **options):
        lat = options['lat']
        lng = options['lng']

        if options['clear']:
            deleted, _ = POI.objects.filter(qr_code_data=DEMO_POI_QR).delete()
            self.stdout.write(self.style.WARNING(f'🗑️  Đã xoá {deleted} POI demo cũ.'))

        poi, created = POI.objects.update_or_create(
            qr_code_data=DEMO_POI_QR,
            defaults={
                **DEMO_DATA['poi'],
                'latitude': lat,
                'longitude': lng,
            },
        )
        action = '✅ Tạo mới' if created else '🔄 Cập nhật'
        self.stdout.write(self.style.SUCCESS(f'{action} POI demo: "{poi.name}" (id={poi.id})'))
        self.stdout.write(f'   📍 Toạ độ: {lat}, {lng}  |  QR code: {DEMO_POI_QR}')

        for p_data in DEMO_DATA['partners']:
            partner, p_created = Partner.objects.update_or_create(
                poi=poi,
                business_name=p_data['business_name'],
                defaults=p_data,
            )
            p_action = '✅' if p_created else '🔄'
            self.stdout.write(f'   {p_action} Partner: {partner.business_name}')

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('🎉 Seed demo hoàn tất! Hướng dẫn demo:'))
        self.stdout.write('')
        self.stdout.write('  📱 CÁCH 1 — Quét QR (khuyến nghị):')
        self.stdout.write('     1. Mở app trên điện thoại → nhấn nút QR scanner')
        self.stdout.write('     2. Quét mã QR chứa text: BCSD-POI-001')
        self.stdout.write('     3. App sẽ phát thuyết minh POI rồi hiện danh sách quán')
        self.stdout.write('')
        self.stdout.write('  🗺️  CÁCH 2 — Bản đồ (nếu đang ở gần toạ độ demo):')
        self.stdout.write(f'     Di chuyển đến ({lat}, {lng}) bán kính 200m')
        self.stdout.write('     App tự phát thuyết minh khi vào vùng geofence')
        self.stdout.write('')
        self.stdout.write('  🔬 CÁCH 3 — Camera lỗi / demo nhanh:')
        self.stdout.write('     1. Mở QR scanner → nếu camera không khả dụng → nhấn "Demo Scan"')
        self.stdout.write('     2. Sẽ trigger POI narration ngay lập tức')
        self.stdout.write('')
        self.stdout.write('  📲 Sau khi narration kết thúc → scroll xuống dưới bottom sheet')
        self.stdout.write('     → Nhấn icon QR 🔲 hoặc "Xem menu" trên card quán → popup QR hiện ra!')
