import os
import django
import json

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from tours.models import Tour

def check():
    tours = Tour.objects.all()
    for t in tours:
        print(f"--- Tour: {t.tour_name} (ID: {t.id}) ---")
        print(f"JA Name: {t.translated_name.get('ja')}")
        print(f"EN Name: {t.translated_name.get('en')}")
        print(f"KO Name: {t.translated_name.get('ko')}")
        print(f"ZH Name: {t.translated_name.get('zh')}")
        print("-" * 30)

if __name__ == '__main__':
    check()
