from django.urls import path

from . import views

app_name = 'gyms'

urlpatterns = [
    path('', views.GymGenericListView.as_view(), name='gym_list'),
    path('<uuid:pk>/', views.GymDetailView.as_view(), name='gym_detail'),
    path('<uuid:pk>/api/top-lifters/', views.top_lifters_view, name='top_lifters'),

    # Internal summary API (chart-ready, no auth required)
    path('api/summary/', views.gym_summary_api, name='gym_summary_api'),
    path('api/busy-summary/', views.busy_level_summary_api, name='busy_level_summary_api'),

    # External API proxy
    path('exercise-search/', views.exercise_search_view, name='exercise_search'),

    # CSV / JSON exports
    path('export/csv/', views.gym_csv_export, name='gym_csv_export'),
    path('export/json/', views.gym_json_export, name='gym_json_export'),

    # Reports page
    path('reports/', views.reports_view, name='reports'),

    # Vega-Lite chart pages
    path('vega-lite/chart1/', views.chart1_view, name='chart1'),
    path('vega-lite/chart2/', views.chart2_view, name='chart2'),
]
