from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(['GET'])
@permission_classes([AllowAny])
def api_root(request):
    """API root endpoint"""
    return Response({
        'app': 'NeonFoodmap',
        'version': '1.0.0',
        'description': 'Ứng dụng thuyết minh du lịch tự động',
        'endpoints': {
            'pois': '/api/pois/',
            'tours': '/api/tours/',
            'users': '/api/users/',
            'analytics': '/api/analytics/',
        }
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """Health check endpoint"""
    return Response({'status': 'ok'})

import io
from django.http import HttpResponse
from gtts import gTTS

@api_view(['GET'])
@permission_classes([AllowAny])
def tts_preview(request):
    """
    Generate TTS preview on-the-fly and return as mp3 stream.
    Useful for frontend preview without being blocked by Tracking Prevention.
    """
    text = request.GET.get('text', '').strip()
    lang = request.GET.get('lang', 'vi')
    if not text:
        return HttpResponse("Text is required", status=400)
    
    try:
        # Lọc bớt locale-specific part nếu frontend gửi 'vi-VN' thay vì 'vi'
        target_lang = lang.split('-')[0].lower()
        
        tts = gTTS(text=text, lang=target_lang)
        fp = io.BytesIO()
        tts.write_to_fp(fp)
        fp.seek(0)
        return HttpResponse(fp.read(), content_type='audio/mpeg')
    except Exception as e:
        return HttpResponse(str(e), status=500)
