import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from pois.models import POI, Media
from core.utils import translate_text

def fix_translation(poi_id):
    try:
        p = POI.objects.get(id=poi_id)
        print(f"Original Vietnamese: {p.description}")
        
        for lang in ['en', 'ja', 'ko', 'zh']:
            m = Media.objects.filter(poi=p, language=lang, media_type='TTS').first()
            if m:
                print(f"Translating for {lang}...")
                m.translated_name = translate_text(p.name, lang)
                m.tts_content = translate_text(p.description, lang)
                m.save()
                print(f"Updated {lang}: {m.tts_content[:100]}...")
            else:
                print(f"No Media record for {lang}")
    except POI.DoesNotExist:
        print(f"POI {poi_id} not found")

if __name__ == '__main__':
    fix_translation(11)
