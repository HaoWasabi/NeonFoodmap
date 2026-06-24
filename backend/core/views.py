from rest_framework.decorators import api_view
from rest_framework.response import Response


@api_view(['GET'])
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
def health_check(request):
    """Health check endpoint"""
    return Response({'status': 'ok'})
