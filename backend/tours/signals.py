import logging
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from core.utils import translate_text

logger = logging.getLogger(__name__)

DEFAULT_LANGS = ['en', 'ja', 'ko', 'zh']

@receiver(pre_save, sender='tours.Tour')
def track_tour_changes(sender, instance, **kwargs):
    """Lưu lại tour_name và description cũ để so sánh trong post_save."""
    if instance.pk:
        try:
            from tours.models import Tour
            old_obj = Tour.objects.only('tour_name', 'description').get(pk=instance.pk)
            instance._old_name = old_obj.tour_name
            instance._old_description = old_obj.description
        except Exception:
            instance._old_name = None
            instance._old_description = None
    else:
        instance._old_name = None
        instance._old_description = None

@receiver(post_save, sender='tours.Tour')
def handle_tour_translations(sender, instance, created, **kwargs):
    """
    Tự động dịch tên và mô tả tour khi có thay đổi.
    """
    old_name = getattr(instance, '_old_name', None)
    old_desc = getattr(instance, '_old_description', None)
    
    name_changed = (old_name != instance.tour_name) or created
    desc_changed = (old_desc != instance.description) or created
    
    if not name_changed and not desc_changed:
        return

    # Khởi tạo data JSON nếu chưa có
    t_name = instance.translated_name or {}
    t_desc = instance.translated_description or {}
    
    needs_save = False

    for lang in DEFAULT_LANGS:
        # Dịch tên
        if name_changed or lang not in t_name:
            translated = translate_text(instance.tour_name, lang)
            if translated:
                t_name[lang] = translated
                needs_save = True
        
        # Dịch mô tả
        if desc_changed or lang not in t_desc:
            translated = translate_text(instance.description, lang)
            if translated:
                t_desc[lang] = translated
                needs_save = True

    if needs_save:
        # Use update() to avoid recursion with post_save signal
        from tours.models import Tour
        Tour.objects.filter(pk=instance.pk).update(
            translated_name=t_name,
            translated_description=t_desc
        )
        logger.info(f'[TourAutoTranslate] Updated translations for tour: {instance.tour_name}')
