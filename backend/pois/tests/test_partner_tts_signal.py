"""
Tests cho chức năng tự động sinh TTS audio khi Partner cập nhật profile.
Kiểm thử:
1. Signal tự động sinh audio cho tất cả ngôn ngữ khi tạo partner với intro_text
2. Signal sinh lại audio khi cập nhật intro_text
3. Signal không chạy khi intro_text không đổi
4. Management command backfill partner thiếu audio
5. PartnerTTSView trả URL từ PartnerIntroMedia (không cần sinh on-demand)
6. PartnerTTSView fallback sinh on-demand và lưu lại kết quả
"""
from unittest.mock import patch, MagicMock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APITestCase

from pois.models import Partner, PartnerIntroMedia, POI
from pois.signals import PARTNER_TTS_LANGS

User = get_user_model()

FAKE_AUDIO_URL = 'https://res.cloudinary.com/test/video/upload/bcsd/tts-audio/test_vi.mp3?v=123'


def mock_generate_tts(text, lang, name):
    """Mock _generate_tts_and_upload: trả URL fake dựa trên lang."""
    if not text or not text.strip():
        return ''
    return f'https://res.cloudinary.com/test/video/upload/bcsd/tts-audio/{name}_{lang}.mp3?v=123'


def mock_translate(text, target_lang):
    """Mock translate_text: trả text + suffix ngôn ngữ."""
    if not text or target_lang == 'vi':
        return text
    return f'[{target_lang}] {text}'


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class PartnerTTSSignalTests(TestCase):
    """Test signal handle_partner_intro_tts."""

    @patch('pois.signals._generate_tts_and_upload', side_effect=mock_generate_tts)
    @patch('pois.signals._translate', side_effect=mock_translate)
    def test_signal_creates_intro_media_on_partner_create(self, mock_trans, mock_tts):
        """Khi tạo Partner mới có intro_text → signal sinh audio cho tất cả ngôn ngữ."""
        partner = Partner.objects.create(
            business_name='Quán Phở Bà Tư',
            intro_text='Quán phở truyền thống 30 năm tại Sài Gòn.',
            status=Partner.Status.ACTIVE,
        )

        # Kiểm tra đã tạo PartnerIntroMedia cho tất cả ngôn ngữ
        intro_medias = PartnerIntroMedia.objects.filter(partner=partner)
        self.assertEqual(intro_medias.count(), len(PARTNER_TTS_LANGS))

        for lang in PARTNER_TTS_LANGS:
            im = intro_medias.get(language=lang)
            self.assertEqual(im.status, PartnerIntroMedia.Status.ACTIVE)
            self.assertIn(lang, im.file_url)
            self.assertTrue(im.file_url.startswith('https://'))
            if lang == 'vi':
                self.assertEqual(im.tts_content, 'Quán phở truyền thống 30 năm tại Sài Gòn.')
            else:
                self.assertIn(f'[{lang}]', im.tts_content)

    @patch('pois.signals._generate_tts_and_upload', side_effect=mock_generate_tts)
    @patch('pois.signals._translate', side_effect=mock_translate)
    def test_signal_updates_intro_media_on_text_change(self, mock_trans, mock_tts):
        """Khi cập nhật intro_text → signal sinh lại audio."""
        partner = Partner.objects.create(
            business_name='Quán Test',
            intro_text='Nội dung cũ.',
            status=Partner.Status.ACTIVE,
        )

        # Reset mock để đếm lại
        mock_tts.reset_mock()
        mock_trans.reset_mock()

        # Cập nhật intro_text
        partner.intro_text = 'Nội dung mới hoàn toàn khác.'
        partner.save()

        # Signal phải chạy lại
        self.assertTrue(mock_tts.called)
        # Kiểm tra tts_content đã cập nhật
        vi_media = PartnerIntroMedia.objects.get(partner=partner, language='vi')
        self.assertEqual(vi_media.tts_content, 'Nội dung mới hoàn toàn khác.')

    @patch('pois.signals._generate_tts_and_upload', side_effect=mock_generate_tts)
    @patch('pois.signals._translate', side_effect=mock_translate)
    def test_signal_does_not_run_when_text_unchanged(self, mock_trans, mock_tts):
        """Khi save partner mà intro_text không đổi → signal không sinh lại."""
        partner = Partner.objects.create(
            business_name='Quán Không Đổi',
            intro_text='Nội dung giữ nguyên.',
            status=Partner.Status.ACTIVE,
        )

        mock_tts.reset_mock()
        mock_trans.reset_mock()

        # Save lại không đổi gì
        partner.address = '123 Đường ABC'
        partner.save()

        # Signal không gọi TTS
        mock_tts.assert_not_called()

    @patch('pois.signals._generate_tts_and_upload', side_effect=mock_generate_tts)
    @patch('pois.signals._translate', side_effect=mock_translate)
    def test_signal_skips_empty_intro_text(self, mock_trans, mock_tts):
        """Partner không có intro_text → signal không chạy."""
        partner = Partner.objects.create(
            business_name='Quán Rỗng',
            intro_text='',
            status=Partner.Status.ACTIVE,
        )

        mock_tts.assert_not_called()
        self.assertEqual(PartnerIntroMedia.objects.filter(partner=partner).count(), 0)

    @patch('pois.signals._generate_tts_and_upload', side_effect=mock_generate_tts)
    @patch('pois.signals._translate', side_effect=mock_translate)
    def test_signal_regenerates_on_business_name_change(self, mock_trans, mock_tts):
        """Đổi business_name cũng kích hoạt signal (vì tên ảnh hưởng public_id Cloudinary)."""
        partner = Partner.objects.create(
            business_name='Tên Cũ',
            intro_text='Giới thiệu quán.',
            status=Partner.Status.ACTIVE,
        )

        mock_tts.reset_mock()

        partner.business_name = 'Tên Mới'
        partner.save()

        self.assertTrue(mock_tts.called)


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class PartnerTTSManagementCommandTests(TestCase):
    """Test management command generate_partner_tts."""

    @patch('pois.signals._generate_tts_and_upload', side_effect=mock_generate_tts)
    @patch('pois.signals._translate', side_effect=mock_translate)
    def test_command_backfills_missing_audio(self, mock_trans, mock_tts):
        """Command tìm partner thiếu audio và sinh bổ sung."""
        from django.core.management import call_command
        from io import StringIO

        # Tạo partner KHÔNG qua signal (giả lập partner cũ chưa có audio)
        partner = Partner(
            business_name='Partner Cũ',
            intro_text='Quán ăn truyền thống.',
            status=Partner.Status.ACTIVE,
        )
        # Save mà bypass signal bằng cách xoá intro_media sau khi signal chạy
        partner.save()
        PartnerIntroMedia.objects.filter(partner=partner).delete()

        mock_tts.reset_mock()
        mock_trans.reset_mock()

        # Chạy command
        out = StringIO()
        with patch('pois.management.commands.generate_partner_tts._generate_tts_and_upload', side_effect=mock_generate_tts):
            with patch('pois.management.commands.generate_partner_tts.translate_text', side_effect=mock_translate):
                call_command('generate_partner_tts', stdout=out)

        output = out.getvalue()
        self.assertIn('Partner Cũ', output)
        self.assertIn('Hoàn tất', output)

        # Verify audio đã được tạo
        count = PartnerIntroMedia.objects.filter(partner=partner).count()
        self.assertEqual(count, len(PARTNER_TTS_LANGS))

    @patch('pois.signals._generate_tts_and_upload', side_effect=mock_generate_tts)
    @patch('pois.signals._translate', side_effect=mock_translate)
    def test_command_dry_run_does_not_modify(self, mock_trans, mock_tts):
        """Command --dry-run chỉ liệt kê, không tạo audio."""
        from django.core.management import call_command
        from io import StringIO

        partner = Partner(
            business_name='Partner Dry',
            intro_text='Test dry run.',
            status=Partner.Status.ACTIVE,
        )
        partner.save()
        PartnerIntroMedia.objects.filter(partner=partner).delete()

        out = StringIO()
        with patch('pois.management.commands.generate_partner_tts._generate_tts_and_upload', side_effect=mock_generate_tts):
            with patch('pois.management.commands.generate_partner_tts.translate_text', side_effect=mock_translate):
                call_command('generate_partner_tts', '--dry-run', stdout=out)

        # Không tạo audio
        count = PartnerIntroMedia.objects.filter(partner=partner).count()
        self.assertEqual(count, 0)
        self.assertIn('Dry-run', out.getvalue())


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class PartnerTTSViewTests(APITestCase):
    """Test endpoint /api/partners/<id>/tts/."""

    @patch('pois.signals._generate_tts_and_upload', side_effect=mock_generate_tts)
    @patch('pois.signals._translate', side_effect=mock_translate)
    def test_tts_endpoint_returns_pregenerated_url(self, mock_trans, mock_tts):
        """Endpoint trả URL đã sinh sẵn từ PartnerIntroMedia (không cần TTS on-demand)."""
        partner = Partner.objects.create(
            business_name='Quán Phục Vụ',
            intro_text='Quán chuyên phục vụ du khách.',
            status=Partner.Status.ACTIVE,
        )

        # Verify audio đã có sẵn
        vi_media = PartnerIntroMedia.objects.get(partner=partner, language='vi')
        self.assertTrue(vi_media.file_url)

        # Reset mock — endpoint không cần gọi lại _generate_tts_and_upload
        mock_tts.reset_mock()

        response = self.client.get(f'/api/partners/{partner.id}/tts/', {'language': 'vi'})

        self.assertEqual(response.status_code, 200)
        self.assertIn('audio_url', response.data)
        self.assertTrue(response.data['audio_url'].startswith('https://'))
        self.assertTrue(response.data['cached'])
        # Không cần sinh on-demand
        mock_tts.assert_not_called()

    @patch('pois.signals._generate_tts_and_upload', side_effect=mock_generate_tts)
    @patch('pois.signals._translate', side_effect=mock_translate)
    def test_tts_endpoint_serves_translated_language(self, mock_trans, mock_tts):
        """Endpoint trả audio cho ngôn ngữ khác (en, ja, etc.)."""
        partner = Partner.objects.create(
            business_name='Quán Đa Ngôn Ngữ',
            intro_text='Quán ăn vỉa hè nổi tiếng.',
            status=Partner.Status.ACTIVE,
        )

        response = self.client.get(f'/api/partners/{partner.id}/tts/', {'language': 'en'})

        self.assertEqual(response.status_code, 200)
        self.assertIn('en', response.data['audio_url'])

    @patch('pois.signals._generate_tts_and_upload', side_effect=mock_generate_tts)
    @patch('pois.signals._translate', side_effect=mock_translate)
    def test_tts_endpoint_fallback_generates_and_saves(self, mock_trans, mock_tts):
        """Nếu PartnerIntroMedia không có record cho ngôn ngữ lạ → sinh on-demand và lưu."""
        partner = Partner.objects.create(
            business_name='Quán Fallback',
            intro_text='Quán ăn truyền thống.',
            status=Partner.Status.ACTIVE,
        )

        # Xoá record của ngôn ngữ 'fr' (nằm ngoài PARTNER_TTS_LANGS nên signal không tạo)
        # Truy cập endpoint với language=fr → phải sinh on-demand
        mock_tts.reset_mock()

        response = self.client.get(f'/api/partners/{partner.id}/tts/', {'language': 'fr'})

        self.assertEqual(response.status_code, 200)
        self.assertIn('audio_url', response.data)
        self.assertFalse(response.data['cached'])

        # Verify đã lưu vào DB cho lần sau
        fr_media = PartnerIntroMedia.objects.filter(partner=partner, language='fr').first()
        self.assertIsNotNone(fr_media)
        self.assertTrue(fr_media.file_url)

    @patch('pois.signals._generate_tts_and_upload', side_effect=mock_generate_tts)
    @patch('pois.signals._translate', side_effect=mock_translate)
    def test_tts_endpoint_404_for_empty_intro(self, mock_trans, mock_tts):
        """Partner không có intro_text → trả 404."""
        partner = Partner.objects.create(
            business_name='Quán Rỗng',
            intro_text='',
            status=Partner.Status.ACTIVE,
        )

        response = self.client.get(f'/api/partners/{partner.id}/tts/', {'language': 'vi'})

        self.assertEqual(response.status_code, 404)


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class PartnerPublicProfileAudioTests(APITestCase):
    """Test endpoint /api/partners/<id>/public/ trả intro_audio đúng."""

    @patch('pois.signals._generate_tts_and_upload', side_effect=mock_generate_tts)
    @patch('pois.signals._translate', side_effect=mock_translate)
    def test_public_profile_includes_pregenerated_audio(self, mock_trans, mock_tts):
        """Endpoint public trả danh sách intro_audio có file_url."""
        partner = Partner.objects.create(
            business_name='Quán Public',
            intro_text='Quán ăn được yêu thích.',
            status=Partner.Status.ACTIVE,
        )

        response = self.client.get(
            f'/api/partners/{partner.id}/public/',
            HTTP_ACCEPT_LANGUAGE='en',
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn('intro_audio', response.data)
        audio_list = response.data['intro_audio']
        self.assertTrue(len(audio_list) > 0)
        # Phải có file_url
        self.assertTrue(audio_list[0]['file_url'].startswith('https://'))

    @patch('pois.signals._generate_tts_and_upload', side_effect=mock_generate_tts)
    @patch('pois.signals._translate', side_effect=mock_translate)
    def test_public_profile_returns_translated_intro_text(self, mock_trans, mock_tts):
        """Endpoint public trả translated_intro_text từ tts_content đã lưu sẵn."""
        partner = Partner.objects.create(
            business_name='Quán Dịch',
            intro_text='Quán chuyên bún bò Huế.',
            status=Partner.Status.ACTIVE,
        )

        response = self.client.get(
            f'/api/partners/{partner.id}/public/',
            {'language': 'en'},
        )

        self.assertEqual(response.status_code, 200)
        # translated_intro_text phải lấy từ tts_content đã lưu (mock trả "[en] ...")
        self.assertIn('[en]', response.data['translated_intro_text'])
