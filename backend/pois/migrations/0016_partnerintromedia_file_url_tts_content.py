"""
Thêm file_url và tts_content vào PartnerIntroMedia, cho phép media_id nullable.
Cho phép lưu URL audio TTS trực tiếp mà không cần tạo record core.Media.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pois', '0015_add_poi_cover_image_url'),
    ]

    operations = [
        migrations.AddField(
            model_name='partnerintromedia',
            name='file_url',
            field=models.URLField(
                blank=True,
                default='',
                help_text='URL Cloudinary của file TTS tự động sinh. Ưu tiên hơn media_id.',
                max_length=1024,
                verbose_name='URL file âm thanh',
            ),
        ),
        migrations.AddField(
            model_name='partnerintromedia',
            name='tts_content',
            field=models.TextField(
                blank=True,
                default='',
                help_text='Văn bản đã dịch dùng để sinh TTS audio.',
                verbose_name='Nội dung TTS (bản dịch)',
            ),
        ),
        migrations.AlterField(
            model_name='partnerintromedia',
            name='media_id',
            field=models.IntegerField(
                blank=True,
                default=None,
                help_text='ID của file media từ bảng core.media (upload vào Cloudinary). Null nếu dùng file_url trực tiếp.',
                null=True,
                verbose_name='Mã file media',
            ),
        ),
    ]
