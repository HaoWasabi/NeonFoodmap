from django.urls import path

from . import views

app_name = 'analytics'

urlpatterns = [
    # BreadcrumbLog
    path(
        'breadcrumbs/batch/',
        views.BreadcrumbBatchCreateView.as_view(),
        name='breadcrumb-batch-create',
    ),

    # NarrationLog
    path(
        'narration/start/',
        views.NarrationStartView.as_view(),
        name='narration-start',
    ),
    path(
        'narration/<int:pk>/end/',
        views.NarrationEndView.as_view(),
        name='narration-end',
    ),
    path(
        'narration/history/',
        views.NarrationHistoryView.as_view(),
        name='narration-history',
    ),
]
