import logging
import threading

from django.apps import AppConfig

logger = logging.getLogger(__name__)


class PoisConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'pois'

    def ready(self):
        import pois.signals  # noqa: F401 — kết nối signals

        # Khi server khởi động: kiểm tra partner nào thiếu audio TTS → sinh bổ sung
        # Chạy trong background thread để không block quá trình startup
        from django.conf import settings
        import os

        # Chỉ chạy trong process chính (tránh double-run khi dùng autoreload)
        # RUN_MAIN='true' khi process con autoreload chạy
        is_main_process = os.environ.get('RUN_MAIN') == 'true' or not settings.DEBUG

        if is_main_process:
            # Dùng connection_created signal để đảm bảo DB đã sẵn sàng
            from django.db.backends.signals import connection_created

            def _trigger_backfill(sender, **kwargs):
                """Kích hoạt backfill sau khi DB connection đầu tiên được tạo."""
                # Ngắt kết nối signal ngay lập tức để chỉ chạy 1 lần
                connection_created.disconnect(_trigger_backfill)
                thread = threading.Thread(
                    target=_backfill_partner_tts,
                    name='partner-tts-backfill',
                    daemon=True,
                )
                thread.start()

            connection_created.connect(_trigger_backfill)


def _backfill_partner_tts():
    """
    Quét tất cả Partner active/pending có intro_text nhưng thiếu audio cho 1+ ngôn ngữ.
    Sinh TTS bổ sung trong background. Không ảnh hưởng đến tốc độ startup.
    """
    import time
    # Chờ 3 giây cho server startup hoàn tất trước khi bắt đầu
    time.sleep(3)

    try:
        from django.db import connection
        from pois.models import Partner, PartnerIntroMedia
        from pois.signals import PARTNER_TTS_LANGS, _generate_tts_and_upload
        from core.utils import translate_text

        # Đảm bảo DB connection mới cho thread này
        connection.ensure_connection()

        partners = list(
            Partner.objects.filter(
                status__in=[Partner.Status.ACTIVE, Partner.Status.PENDING_APPROVAL],
            ).exclude(intro_text='')
        )

        if not partners:
            logger.info('[StartupTTS] Không có partner nào cần bổ sung audio.')
            return

        total_generated = 0

        for partner in partners:
            for lang in PARTNER_TTS_LANGS:
                existing = PartnerIntroMedia.objects.filter(
                    partner=partner,
                    language=lang,
                    voice_region='',
                    status=PartnerIntroMedia.Status.ACTIVE,
                ).first()

                # Đã có audio → bỏ qua
                if existing and existing.file_url:
                    continue

                # Thiếu audio → sinh bổ sung
                if lang == 'vi':
                    tts_text = partner.intro_text
                else:
                    tts_text = translate_text(partner.intro_text, lang)
                    if not tts_text or not tts_text.strip():
                        tts_text = partner.intro_text

                audio_url = _generate_tts_and_upload(tts_text, lang, partner.business_name)
                if not audio_url:
                    logger.warning(
                        f'[StartupTTS] Không thể sinh {lang} cho Partner "{partner.business_name}"'
                    )
                    continue

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
                logger.info(
                    f'[StartupTTS] Đã sinh {lang} cho Partner "{partner.business_name}"'
                )

        if total_generated > 0:
            # Xoá cache liên quan
            from django.core.cache import cache
            for partner in partners:
                for lang in PARTNER_TTS_LANGS:
                    cache.delete(f'partner_tts_{partner.pk}_{lang}')

            logger.info(f'[StartupTTS] Hoàn tất: đã bổ sung {total_generated} file audio.')
        else:
            logger.info('[StartupTTS] Tất cả partner đã có đủ audio 5 ngôn ngữ.')

    except Exception as e:
        logger.error(f'[StartupTTS] Lỗi khi backfill: {e}', exc_info=True)
