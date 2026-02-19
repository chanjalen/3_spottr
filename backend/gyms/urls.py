from django.urls import path

from . import views

app_name = 'gyms'

urlpatterns = [
    path('', views.GymGenericListView.as_view(), name='gym_list'),
    path('<uuid:pk>/', views.GymDetailView.as_view(), name='gym_detail'),
    path('<uuid:pk>/api/top-lifters/', views.top_lifters_view, name='top_lifters'),
]
