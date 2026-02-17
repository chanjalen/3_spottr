from django.urls import path

from . import views

app_name = 'gyms'

urlpatterns = [
    # Function-based views
    path('manual/', views.gym_list_manual, name='gym_list_manual'),
    path('render/', views.gym_list_render, name='gym_list_render'),
    # Class-based views
    path('cbv/', views.GymListView.as_view(), name='gym_list_cbv'),
    path('generic/', views.GymGenericListView.as_view(), name='gym_list_generic'),
path('<uuid:pk>/', views.GymDetailView.as_view(), name='gym_detail'),
    path('<uuid:pk>/api/top-lifters/', views.top_lifters_view, name='top_lifters'),
]
