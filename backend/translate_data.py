import os
import django
import json

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from pois.models import POI, Media
from tours.models import Tour

def translate_data():
    # POI Translations
    translations = {
        8: {
            'ja': {'name': 'ヴィンカン・フードストリート', 'desc': 'ホーチミン市4区にある最も有名なグルメ通りです。'},
            'en': {'name': 'Vinh Khanh Food Street', 'desc': 'The most famous food street in District 4, HCMC.'}
        },
        11: {
            'ja': {'name': 'ヴィンカン古寺', 'desc': 'ヴィンカン通りにある150年以上の歴史を持つ寺院です。'},
            'en': {'name': 'Vinh Khanh Ancient Pagoda', 'desc': 'An ancient pagoda with over 150 years of history.'}
        },
        14: {
            'ja': {'name': 'ハハホホ', 'desc': 'バカヤロウ (Baka yarou)'},
            'en': {'name': 'Haha Hoho', 'desc': 'Baka yarou'}
        }
    }

    for poi_id, trans in translations.items():
        try:
            poi = POI.objects.get(id=poi_id)
            for lang, data in trans.items():
                media, created = Media.objects.get_or_create(
                    poi=poi,
                    language=lang,
                    voice_region='mien_nam',
                    defaults={'media_type': 'TTS'}
                )
                media.translated_name = data['name']
                media.tts_content = data['desc']
                media.status = 1
                media.save()
                print(f"Updated POI {poi_id} ({lang}): {data['name']}")
        except POI.DoesNotExist:
            print(f"POI {poi_id} not found")

    # Tour Translations
    tour_trans = {
        1: {
            'ja': 'サイゴンの夜通しの街', 
            'en': 'Saigon Never Sleeps Street'
        },
        3: {
            'ja': 'サイゴンの大衆グルメ',
            'en': 'Saigon Street Food'
        }
    }
    
    tour_desc_trans = {
        1: {
            'ja': 'ヴィンカン通りで最も活気のある夜遊びスポットを巡るツアー。',
            'en': 'A tour of the most vibrant nightlife spots on Vinh Khanh Street.'
        },
        3: {
            'ja': 'サイゴンの最も有名な大衆料理を体験するツアー。',
            'en': 'A tour to experience the most famous street food in Saigon.'
        }
    }

    for tour_id, name_data in tour_trans.items():
        try:
            tour = Tour.objects.get(id=tour_id)
            tour.translated_name = name_data
            tour.translated_description = tour_desc_trans.get(tour_id, {})
            tour.save()
            print(f"Updated Tour {tour_id}: {name_data['ja']}")
        except Tour.DoesNotExist:
            print(f"Tour {tour_id} not found")

if __name__ == '__main__':
    translate_data()
