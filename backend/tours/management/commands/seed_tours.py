"""
Management command: seed_tours
Tạo dữ liệu mẫu Tour + Tour_POI theo frontend mock (GuidedTour.tsx).

Usage:
    python manage.py seed_tours
    python manage.py seed_tours --reset
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from pois.models import POI
from tours.models import Tour, Tour_POI


SAMPLE_TOURS = [
    {
        "name": "Xuyên Đêm Phố Vĩnh Khánh",
        "description": "Khám phá các hàng quán đêm sầm uất nhất phố Vĩnh Khánh.",
        "status": Tour.Status.ACTIVE,
        "is_suggested": True,
        "estimated_duration_min": 90,
        "pois": [
            "BCSD-POI-001",
            "BCSD-POI-002",
            "BCSD-POI-003",
        ],
    },
    {
        "name": "Văn Hóa Phố Quận 4",
        "description": "Chùa cổ, gốc cây bồ đề và câu chuyện lịch sử khu dân cư lâu đời nhất Quận 4.",
        "status": Tour.Status.ACTIVE,
        "is_suggested": True,
        "estimated_duration_min": 60,
        "pois": [
            "BCSD-POI-004",
        ],
    },
    {
        "name": "Ẩm Thực Bình Dân Sài Gòn",
        "description": "Lang thang và thưởng thức các món ăn bình dân nổi tiếng nhất Sài Gòn.",
        "status": Tour.Status.ACTIVE,
        "is_suggested": False,
        "estimated_duration_min": 120,
        "pois": [],
    },
]


class Command(BaseCommand):
    help = "Seed dữ liệu Tour + Tour_POI theo frontend mock"

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Xoá toàn bộ tour hiện tại và tạo lại từ đầu",
        )

    def _get_seed_user(self):
        user_model = get_user_model()

        defaults = {
            "username": "seed_tours",
            "device_id": "seed-tour-device",
            "preferred_language": "vi",
            "preferred_voice_region": "mien_nam",
        }

        if hasattr(user_model, "Status"):
            defaults["status"] = user_model.Status.ACTIVE

        user, created = user_model.objects.get_or_create(
            email="seed.tours@bcsd.local",
            defaults=defaults,
        )

        if created:
            user.set_unusable_password()
            user.save(update_fields=["password"])

        return user

    def handle(self, *args, **options):
        if options["reset"]:
            Tour.objects.all().delete()
            self.stdout.write(self.style.WARNING("  Đã xoá toàn bộ dữ liệu Tour cũ."))

        seed_user = self._get_seed_user()
        created_count = 0
        updated_count = 0
        mapping_count = 0
        missing_poi_codes = []

        for item in SAMPLE_TOURS:
            poi_codes = item["pois"]
            defaults = {
                "description": item["description"],
                "status": item["status"],
                "is_suggested": item["is_suggested"],
                "estimated_duration_min": item["estimated_duration_min"],
                "created_by": seed_user,
            }

            tour, created = Tour.objects.update_or_create(
                tour_name=item["name"],
                defaults=defaults,
            )

            if created:
                created_count += 1
                self.stdout.write(f"  ✅ Tạo Tour: {tour.tour_name}")
            else:
                updated_count += 1
                self.stdout.write(f"  ♻️  Cập nhật Tour: {tour.tour_name}")

            Tour_POI.objects.filter(tour=tour).delete()

            for sequence, qr_code in enumerate(poi_codes, start=1):
                poi = POI.objects.filter(qr_code_data=qr_code).first()
                if not poi:
                    missing_poi_codes.append(qr_code)
                    self.stdout.write(
                        self.style.WARNING(
                            f"    ⚠️  Không tìm thấy POI qr_code_data={qr_code} cho tour '{tour.tour_name}'"
                        )
                    )
                    continue

                Tour_POI.objects.create(
                    tour=tour,
                    poi=poi,
                    sequence_order=sequence,
                    status=Tour_POI.Status.ACTIVE,
                )
                mapping_count += 1

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"✅ Hoàn tất! Tạo mới: {created_count} tour, cập nhật: {updated_count} tour, "
                f"mapping Tour_POI: {mapping_count}."
            )
        )

        if missing_poi_codes:
            self.stdout.write(
                self.style.WARNING(
                    "⚠️ Một số POI chưa tồn tại. Hãy chạy `python manage.py seed_pois` trước nếu cần."
                )
            )
