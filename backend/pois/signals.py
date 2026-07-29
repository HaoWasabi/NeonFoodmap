"""
pois/signals.py
Tự động khởi tạo, dịch tts_content, và sinh file TTS audio (upload lên Cloudinary)
cho các ngôn ngữ mặc định khi POI hoặc Partner được tạo/cập nhật.
"""
import io
import logging
import tempfile

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)

DEFAULT_LANGS = ['en', 'ja', 'ko', 'zh']

# Mapping từ mã ngôn ngữ app → mã ngôn ngữ cho gTTS
GTTS_LANG_MAP = {
    'vi': 'vi',
    'en': 'en',
    'ja': 'ja',
    'ko': 'ko',
    'zh': 'zh-CN',
}


from core.utils import translate_text as _translate


def _generate_tts_and_upload(text: str, lang: str, poi_name: str) -> str:
    """
    Sinh file TTS (.mp3) từ text bằng gTTS, upload lên Cloudinary.
    Trả về URL Cloudinary (secure_url) hoặc '' nếu lỗi.
    """
    if not text or not text.strip():
        return ''

    gtts_lang = GTTS_LANG_MAP.get(lang, lang)

    try:
        from gtts import gTTS
        import cloudinary.uploader
        from django.utils.text import slugify

        # Sinh audio vào buffer trong RAM (không cần file tạm trên disk)
        tts = gTTS(text=text, lang=gtts_lang, slow=False)
        audio_buffer = io.BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)

        # Upload lên Cloudinary
        # public_id format: bcsd/tts-audio/<poi_name_slugified>_<lang>
        safe_name = slugify(poi_name) or f"poi_{lang}"
        public_id = f'bcsd/tts-audio/{safe_name}_{lang}'

        result = cloudinary.uploader.upload(
            audio_buffer,
            resource_type='video',  # Cloudinary dùng 'video' cho audio files
            folder='',  # folder đã nằm trong public_id
            public_id=public_id,
            overwrite=True,
            format='mp3',
        )

        url = result.get('secure_url', '')
        if url:
            version = result.get('version', '')
            if version:
                url = f"{url}?v={version}"
            logger.info(f'[TTS] Uploaded {lang} audio for POI "{poi_name}" → {url}')
        return url

    except Exception as e:
        logger.warning(f'[TTS] Lỗi sinh TTS ({lang}) cho POI "{poi_name}": {e}')
        return ''


# ─── 1. Khi POI được lưu (Tạo mới hoặc Sửa) ──────────────────────────────────
@receiver(pre_save, sender='pois.POI')
def track_poi_changes(sender, instance, **kwargs):
    """Lưu lại name và description cũ để so sánh trong post_save."""
    if instance.pk:
        try:
            from pois.models import POI
            old_obj = POI.objects.only('name', 'description').get(pk=instance.pk)
            instance._old_name = old_obj.name
            instance._old_description = old_obj.description
        except Exception:
            instance._old_name = None
            instance._old_description = None
    else:
        instance._old_name = None
        instance._old_description = None


@receiver(post_save, sender='pois.POI')
def handle_poi_translations(sender, instance, created, **kwargs):
    """
    Tự động hóa:
    1. Tạo Media record thiếu cho các ngôn ngữ mặc định.
    2. Dịch/Cập nhật tts_content cho tất cả Media TTS của POI này.
    3. Sinh file TTS audio (.mp3) và upload lên Cloudinary.
    """
    if not instance.description:
        return

    from pois.models import Media
    old_name = getattr(instance, '_old_name', None)
    old_desc = getattr(instance, '_old_description', None)
    is_changed = (old_desc != instance.description) or (old_name != instance.name) or created

    # Tìm hoặc tạo Media TTS cho tiếng Việt gốc
    vi_media = Media.objects.filter(
        poi=instance,
        language='vi',
        media_type=Media.MediaType.TTS
    ).first()
    
    vi_created = False
    if not vi_media:
        vi_media = Media.objects.create(
            poi=instance,
            language='vi',
            media_type=Media.MediaType.TTS,
            status=Media.Status.ACTIVE,
            tts_content=instance.description
        )
        vi_created = True

    if vi_created or is_changed or not vi_media.tts_content:
        vi_media.tts_content = instance.description
        vi_media.save(update_fields=['tts_content'])

    # Sinh TTS audio cho tiếng Việt nếu cần
    if vi_created or is_changed or not vi_media.file_url:
        url = _generate_tts_and_upload(instance.description, 'vi', instance.name)
        if url:
            vi_media.file_url = url
            vi_media.save(update_fields=['file_url'])

    # Xử lý các ngôn ngữ mặc định khác
    for lang in DEFAULT_LANGS:
        media = Media.objects.filter(
            poi=instance,
            language=lang,
            media_type=Media.MediaType.TTS
        ).first()

        media_created = False
        if not media:
            media = Media.objects.create(
                poi=instance,
                language=lang,
                media_type=Media.MediaType.TTS,
                status=Media.Status.ACTIVE
            )
            media_created = True

        # Dịch tts_content và translated_name nếu cần
        needs_translate = media_created or is_changed or not media.tts_content or not media.translated_name
        if needs_translate:
            # Dịch mô tả (cho TTS)
            translated_desc = _translate(instance.description, lang)
            if translated_desc:
                media.tts_content = translated_desc
            
            # Dịch tên
            translated_name = _translate(instance.name, lang)
            if translated_name:
                media.translated_name = translated_name
            
            if translated_desc or translated_name:
                media.save(update_fields=['tts_content', 'translated_name'])
                logger.info(f'[AutoTranslate] Updated {lang} for POI: {instance.name}')

        # Sinh TTS audio nếu cần (mới tạo, description thay đổi, hoặc chưa có file)
        needs_tts = media_created or is_changed or not media.file_url
        if needs_tts and media.tts_content:
            url = _generate_tts_and_upload(media.tts_content, lang, instance.name)
            if url:
                media.file_url = url
                media.save(update_fields=['file_url'])


# ─── 2. Hỗ trợ trường hợp cập nhật Media thủ công trong Admin ─────────────────
@receiver(pre_save, sender='pois.Media')
def track_media_changes(sender, instance, **kwargs):
    """Lưu lại tts_content cũ để so sánh trong post_save."""
    if instance.pk:
        try:
            from pois.models import Media
            instance._old_tts_content = Media.objects.only('tts_content').get(pk=instance.pk).tts_content
        except Exception:
            instance._old_tts_content = None
    else:
        instance._old_tts_content = None


@receiver(post_save, sender='pois.Media')
def handle_manual_media_updates(sender, instance, created, **kwargs):
    """
    1. Nếu Admin để trống tts_content + không phải 'vi' -> Tự dịch.
    2. Nếu tts_content thay đổi (hoặc mới) -> Sinh lại TTS audio.
    """
    if instance.media_type != 'TTS':
        return

    from pois.models import Media
    old_tts = getattr(instance, '_old_tts_content', None)
    is_changed = (old_tts != instance.tts_content) or created

    # Trường hợp 1: Tự động dịch nếu để trống
    if not instance.tts_content and instance.language != 'vi' and instance.poi.description:
        translated = _translate(instance.poi.description, instance.language)
        if translated:
            Media.objects.filter(pk=instance.pk).update(tts_content=translated)
            instance.tts_content = translated # Cập nhật instance để dùng bên dưới
            is_changed = True # Coi như thay đổi để sinh TTS
            logger.info(f'[AutoTranslate] Manual Media #{instance.pk} ({instance.language}) translated.')

    # Trường hợp 2: Sinh TTS audio nếu nội dung thay đổi hoặc chưa có file
    if (is_changed or not instance.file_url) and instance.tts_content:
        url = _generate_tts_and_upload(instance.tts_content, instance.language, instance.poi.name)
        if url:
            # Update trực tiếp để tránh loop
            Media.objects.filter(pk=instance.pk).update(file_url=url)
            logger.info(f'[TTS] Media #{instance.pk} ({instance.language}) audio updated.')


# ─── 3. Khi Partner được lưu — Tự động sinh TTS cho tất cả ngôn ngữ ───────────
PARTNER_TTS_LANGS = ['vi', 'en', 'ja', 'ko', 'zh']


@receiver(pre_save, sender='pois.Partner')
def track_partner_changes(sender, instance, **kwargs):
    """Lưu lại intro_text cũ để so sánh trong post_save."""
    if instance.pk:
        try:
            from pois.models import Partner
            old_obj = Partner.objects.only('intro_text', 'business_name').get(pk=instance.pk)
            instance._old_intro_text = old_obj.intro_text
            instance._old_business_name = old_obj.business_name
        except Exception:
            instance._old_intro_text = None
            instance._old_business_name = None
    else:
        instance._old_intro_text = None
        instance._old_business_name = None


@receiver(post_save, sender='pois.Partner')
def handle_partner_intro_tts(sender, instance, created, **kwargs):
    """
    Tự động sinh TTS audio cho tất cả ngôn ngữ khi Partner tạo mới hoặc cập nhật intro_text.
    Lưu kết quả vào bảng partner_intro_media để khách truy cập không phải chờ sinh on-demand.
    """
    intro_text = instance.intro_text or ''
    if not intro_text.strip():
        return

    old_intro = getattr(instance, '_old_intro_text', None)
    old_name = getattr(instance, '_old_business_name', None)
    is_changed = (
        created
        or (old_intro != instance.intro_text)
        or (old_name != instance.business_name)
    )

    if not is_changed:
        return

    from pois.models import PartnerIntroMedia

    for lang in PARTNER_TTS_LANGS:
        # Xác định text: nếu ngôn ngữ gốc (vi) dùng trực tiếp, ngôn ngữ khác → dịch
        if lang == 'vi':
            tts_text = intro_text
        else:
            tts_text = _translate(intro_text, lang)
            if not tts_text or not tts_text.strip():
                tts_text = intro_text  # Fallback nếu dịch thất bại

        # Sinh audio TTS
        audio_url = _generate_tts_and_upload(tts_text, lang, instance.business_name)
        if not audio_url:
            logger.warning(
                f'[PartnerTTS] Không thể sinh audio {lang} cho Partner "{instance.business_name}"'
            )
            continue

        # Lưu hoặc cập nhật record PartnerIntroMedia
        intro_media, _ = PartnerIntroMedia.objects.update_or_create(
            partner=instance,
            language=lang,
            voice_region='',  # Mặc định không phân biệt vùng
            defaults={
                'file_url': audio_url,
                'tts_content': tts_text,
                'media_id': None,
                'status': PartnerIntroMedia.Status.ACTIVE,
            },
        )
        logger.info(
            f'[PartnerTTS] {lang} audio ready for Partner "{instance.business_name}" → {audio_url}'
        )

    # Xoá cache cũ (nếu có) để lần truy cập tiếp theo lấy URL mới
    from django.core.cache import cache
    for lang in PARTNER_TTS_LANGS:
        cache.delete(f'partner_tts_{instance.pk}_{lang}')
