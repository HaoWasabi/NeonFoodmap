import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from tours.models import Tour

def translate_all_tours():
    tours = list(Tour.objects.all())
    print(f"Found {len(tours)} tours.")
    
    for t in tours:
        print(f"Forcing re-translation for Tour: {t.tour_name} (ID: {t.id})")
        
        # Modify name slightly to trigger the 'changed' logic in signal
        orig_name = t.tour_name
        t.tour_name = orig_name + " [FORCE]"
        t.save()
        
        # Set it back
        t.tour_name = orig_name
        t.save()
        
        print(f"Completed {t.tour_name}")

if __name__ == '__main__':
    translate_all_tours()
