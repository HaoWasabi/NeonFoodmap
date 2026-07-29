"""
Management command: python manage.py generate_partner_tts

Quét tất cả Partner có intro_text nhưng chưa có đủ audio TTS cho các ngôn ngữ,
và tự động sinh + upload file audio lên Cloudinary.

Dùng khi:
- Backfill lần đầu (bảng partner_intro_media đang rỗng)
- Chạy định kỳ (cron) để đảm bảo partner nào thiếu audio sẽ được bổ sung
- Chạy sau khi thêm ngôn ngữ mới vào PARTNER_TTS_LANGS

Options:
  --partner-id <id>   Chỉ xử lý partner cụ thể
  --force             Sinh lại audio ngay cả khi đã có (overwrite)
  --dry-run           Chỉ liệt kê partner cần xử lý, không sinh audio
"""
import logging

from django.core.management.base import BaseCommand

from pois.models import Partner, PartnerIntroMedia
from pois.signals import PARTNER_TTS_LANGS, _generate_tts_and_upload
from core.utils import translate_text

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Sinh TTS audio cho tất cả Partner chưa có đủ file thuyết minh đa ngôn ngữ.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--partner-id',
            type=int,
            default=None,
            help='Chỉ xử lý partner với ID cụ thể.',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Sinh lại audio ngay cả khi đã có (overwrite).',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Chỉ liệt kê partner cần xử lý, không sinh audio.',
        )

    def handle(self, *args, **options):
        partner_id = options['partner_id']
        force = options['force']
        dry_run = options['dry_run']

        # Lấy danh sách partner cần xử lý
        qs = Partner.objects.filter(
            status__in=[Partner.Status.ACTIVE, Partner.Status.PENDING_APPROVAL],
        ).exclude(intro_text='')

        if partner_id:
            qs = qs.filter(pk=partner_id)

        partners = list(qs)
        self.stdout.write(f'Tìm thấy {len(partners)} partner có intro_text.')

        total_generated = 0
        total_skipped = 0

        for partner in partners:
            missing_langs = []

            for lang in PARTNER_TTS_LANGS:
                existing = PartnerIntroMedia.objects.filter(
                    partner=partner,
                    language=lang,
                    voice_region='',
                    status=PartnerIntroMedia.Status.ACTIVE,
                ).first()

                if existing and existing.file_url and not force:
                    total_skipped += 1
                    continue

                missing_langs.append(lang)

            if not missing_langs:
                continue

            self.stdout.write(
                f'  [{partner.id}] {partner.business_name} — '
                f'thiếu: {", ".join(missing_langs)}'
            )

            if dry_run:
                continue

            for lang in missing_langs:
                # Dịch text
                if lang == 'vi':
                    tts_text = partner.intro_text
                else:
                    tts_text = translate_text(partner.intro_text, lang)
                    if not tts_text or not tts_text.strip():
                        tts_text = partner.intro_text

                # Sinh TTS audio
                audio_url = _generate_tts_and_upload(tts_text, lang, partner.business_name)
                if not audio_url:
                    self.stderr.write(
                        self.style.WARNING(
                            f'    ✗ {lang}: không thể sinh audio'
                        )
                    )
                    continue

                # Lưu vào DB
                PartnerIntroMedia.objects.update_or_create(
                    partner=partner,
                    language=lang,
                    voice_region='',
                    defaults={
                        'file_url': audio_url,
                        'tts_content': tts_text,
                        'media_id': None,
                        'status': PartnerIntroMedia.Status.ACTIVE,
                    },
                )
                total_generated += 1
                self.stdout.write(
                    self.style.SUCCESS(f'    ✓ {lang}: {audio_url[:80]}...')
                )

        # Xoá cache
        if not dry_run and total_generated > 0:
            from django.core.cache import cache
            for partner in partners:
                for lang in PARTNER_TTS_LANGS:
                    cache.delete(f'partner_tts_{partner.pk}_{lang}')

        self.stdout.write('')
        self.stdout.write(
            self.style.SUCCESS(
                f'Hoàn tất: {total_generated} audio mới sinh, {total_skipped} đã có sẵn.'
            )
        )
        if dry_run:
            self.stdout.write(self.style.NOTICE('(Dry-run — không có thay đổi nào được thực hiện)'))
