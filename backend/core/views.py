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
