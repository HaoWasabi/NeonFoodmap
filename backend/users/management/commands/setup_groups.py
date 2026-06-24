"""
Management command to setup default permission groups.
Usage: python manage.py setup_groups
"""
from django.core.management.base import BaseCommand
from django.contrib.auth.models import Group


class Command(BaseCommand):
    help = 'Tạo các group quyền mặc định: Admin, Partner, User'

    def handle(self, *args, **options):
        groups = ['Admin', 'Partner', 'User']

        for group_name in groups:
            group, created = Group.objects.get_or_create(name=group_name)
            if created:
                self.stdout.write(
                    self.style.SUCCESS(f'Đã tạo group: {group_name}')
                )
            else:
                self.stdout.write(
                    self.style.WARNING(f'Group đã tồn tại: {group_name}')
                )

        self.stdout.write(self.style.SUCCESS('Setup groups hoàn tất!'))
