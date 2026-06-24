"""
Management command: seed_pois
Tạo dữ liệu POI mẫu cho phố Vĩnh Khánh, Quận 4, TP.HCM để test API near-me.

Usage:
    python manage.py seed_pois          # Tạo mới (bỏ qua nếu đã tồn tại)
    python manage.py seed_pois --reset  # Xoá toàn bộ và tạo lại
"""

from django.core.management.base import BaseCommand
from pois.models import Media, POI, Partner


# ---------------------------------------------------------------------------
# Dữ liệu mẫu – phố Vĩnh Khánh, Q4, TP.HCM
# Toạ độ trung tâm: lat=10.7552, lng=106.7038
# ---------------------------------------------------------------------------
SAMPLE_POIS = [
    {
        "name": "Hẻm Bánh Tráng Nướng",
        "description": (
            "Hẻm nổi tiếng với bánh tráng nướng giòn rụm, phủ đầy trứng cút, tôm khô "
            "và đủ loại topping. Một trong những món ăn đường phố đặc trưng nhất của "
            "phố Vĩnh Khánh. Hoạt động từ 16:00 đến 23:00 mỗi ngày."
        ),
        "latitude": 10.7550,
        "longitude": 106.7035,
        "geofence_radius": 40,
        "category": "food",
        "qr_code_data": "BCSD-POI-001",
        "media": [
            {
                "language": "vi",
                "voice_region": "mien_nam",
                "media_type": "TTS",
                "file_url": "",
            },
            {
                "language": "en",
                "voice_region": "",
                "media_type": "TTS",
                "file_url": "",
            },
        ],
        "partners": [
            {
                "business_name": "Bánh Tráng Chị Hoa",
                "opening_hours": "16:00 - 23:00",
                "menu_details": {
                    "must_try": ["Bánh tráng nướng trứng cút", "Bánh tráng nướng phô mai"],
                    "price_range": "10k - 25k",
                },
            },
            {
                "business_name": "Bánh Tráng Anh Tú",
                "opening_hours": "17:00 - 22:30",
                "menu_details": {
                    "must_try": ["Bánh tráng nướng tôm khô", "Bánh tráng cuộn"],
                    "price_range": "15k - 30k",
                },
            },
        ],
    },
    {
        "name": "Quán Hải Sản Đêm Vĩnh Khánh",
        "description": (
            "Khu ẩm thực hải sản đêm nổi tiếng nhất Quận 4 với các món ghẹ rang me, "
            "ốc hương xào, tôm nướng muối ớt được chế biến tươi ngon từ hải sản nhập "
            "trực tiếp mỗi ngày. Ngồi vỉa hè, không khí đường phố đặc trưng Sài Gòn."
        ),
        "latitude": 10.7558,
        "longitude": 106.7042,
        "geofence_radius": 50,
        "category": "food",
        "qr_code_data": "BCSD-POI-002",
        "media": [
            {
                "language": "vi",
                "voice_region": "mien_nam",
                "media_type": "TTS",
                "file_url": "",
            },
        ],
        "partners": [
            {
                "business_name": "Hải Sản Cô Ba",
                "opening_hours": "17:00 - 01:00",
                "menu_details": {
                    "must_try": ["Ghẹ rang me", "Ốc hương xào dừa", "Tôm nướng muối ớt"],
                    "price_range": "150k - 500k",
                },
            },
        ],
    },
    {
        "name": "Góc Chè & Nước Ép Trái Cây",
        "description": (
            "Điểm dừng chân quen thuộc của dân địa phương sau bữa ăn với hơn 30 loại chè "
            "truyền thống Nam Bộ: chè đậu xanh bột báng, chè khúc bạch, chè 3 màu... "
            "cùng các loại nước ép trái cây nhiệt đới tươi mát, mở cửa từ sáng đến đêm."
        ),
        "latitude": 10.7545,
        "longitude": 106.7028,
        "geofence_radius": 30,
        "category": "food",
        "qr_code_data": "BCSD-POI-003",
        "media": [
            {
                "language": "vi",
                "voice_region": "mien_nam",
                "media_type": "TTS",
                "file_url": "",
            },
        ],
        "partners": [
            {
                "business_name": "Chè Nguyên",
                "opening_hours": "08:00 - 23:00",
                "menu_details": {
                    "must_try": ["Chè khúc bạch", "Chè 3 màu", "Nước mía ép"],
                    "price_range": "20k - 45k",
                },
            },
        ],
    },
    {
        "name": "Chùa Vĩnh Khánh Cổ",
        "description": (
            "Ngôi chùa hơn 150 tuổi nằm giữa lòng phố ẩm thực Vĩnh Khánh, là nơi người "
            "dân địa phương và tiểu thương đến thắp hương cầu bình an mỗi sáng sớm. "
            "Kiến trúc đặc trưng phong cách Nam Bộ, mái ngói đỏ, cổng tam quan uy nghiêm."
        ),
        "latitude": 10.7565,
        "longitude": 106.7050,
        "geofence_radius": 60,
        "category": "historical",
        "qr_code_data": "BCSD-POI-004",
        "media": [
            {
                "language": "vi",
                "voice_region": "mien_nam",
                "media_type": "TTS",
                "file_url": "",
            },
            {
                "language": "en",
                "voice_region": "",
                "media_type": "TTS",
                "file_url": "",
            },
        ],
        "partners": [],
    },
    {
        "name": "Cổng Chào Phố Vĩnh Khánh",
        "description": (
            "Cổng chào biểu tượng của tuyến phố ẩm thực đêm Vĩnh Khánh, được thiết kế "
            "với đèn LED rực rỡ. Là điểm check-in nổi tiếng và cũng là điểm khởi đầu "
            "lý tưởng để khám phá toàn bộ tuyến phố ẩm thực. Sáng đèn từ 18:00 - 24:00."
        ),
        "latitude": 10.7540,
        "longitude": 106.7022,
        "geofence_radius": 45,
        "category": "cultural",
        "qr_code_data": "BCSD-POI-005",
        "media": [
            {
                "language": "vi",
                "voice_region": "mien_nam",
                "media_type": "TTS",
                "file_url": "",
            },
        ],
        "partners": [],
    },
    {
        "name": "Khu Bún Bò & Phở Sáng",
        "description": (
            "Khu tập trung các quán phở và bún bò Huế mở từ 5 giờ sáng, phục vụ dân "
            "lao động và tiểu thương trong khu vực. Nước dùng hầm xương nhiều giờ, "
            "thịt bò tươi, rau sống phong phú. Đây là bữa sáng 'quốc dân' của người Q4."
        ),
        "latitude": 10.7570,
        "longitude": 106.7032,
        "geofence_radius": 40,
        "category": "food",
        "qr_code_data": "BCSD-POI-006",
        "media": [
            {
                "language": "vi",
                "voice_region": "mien_nam",
                "media_type": "TTS",
                "file_url": "",
            },
        ],
        "partners": [
            {
                "business_name": "Phở Ký",
                "opening_hours": "05:00 - 10:00",
                "menu_details": {
                    "must_try": ["Phở bò tái nạm", "Hủ tiếu bò"],
                    "price_range": "45k - 65k",
                },
            },
            {
                "business_name": "Bún Bò Cô Hương",
                "opening_hours": "05:30 - 10:30",
                "menu_details": {
                    "must_try": ["Bún bò Huế giò heo", "Bún bò chả cua"],
                    "price_range": "50k - 70k",
                },
            },
        ],
    },
]


class Command(BaseCommand):
    help = "Seed dữ liệu POI mẫu cho phố Vĩnh Khánh, Q4, TP.HCM"

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Xoá toàn bộ POI hiện tại và tạo lại từ đầu",
        )

    def handle(self, *args, **options):
        if options["reset"]:
            deleted, _ = POI.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"  Đã xoá {deleted} bản ghi cũ."))

        created_count = 0
        skipped_count = 0

        for data in SAMPLE_POIS:
            media_data = data.pop("media", [])
            partners_data = data.pop("partners", [])

            poi, created = POI.objects.get_or_create(
                qr_code_data=data["qr_code_data"],
                defaults=data,
            )

            if created:
                created_count += 1
                self.stdout.write(f"  ✅ Tạo POI: {poi.name}")

                # Tạo Media records
                for m in media_data:
                    Media.objects.create(poi=poi, **m)

                # Tạo Partner records
                for p in partners_data:
                    Partner.objects.create(poi=poi, **p)
            else:
                skipped_count += 1
                self.stdout.write(
                    self.style.NOTICE(f"  ⏭  Bỏ qua (đã tồn tại): {poi.name}")
                )

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"✅ Hoàn tất! Tạo mới: {created_count} POI, bỏ qua: {skipped_count} POI."
            )
        )

        if created_count > 0:
            self.stdout.write("")
            self.stdout.write("📡 Test API near-me:")
            self.stdout.write(
                "   GET http://localhost:8000/api/pois/near-me/"
                "?lat=10.7552&lng=106.7038&radius=500"
            )
