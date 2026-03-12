from django.urls import path
from . import views

app_name = 'workouts'

urlpatterns = [
    # Main log workout page
    path('log/', views.log_workout_view, name='log_workout'),

    # Start a new workout
    path('start/', views.start_workout_view, name='start_workout'),

    # Streak
    path('streak/', views.streak_details_view, name='streak_details'),
    path('rest-day/', views.rest_day_view, name='rest_day'),
    path('api/streak/', views.streak_api_view, name='streak_api'),
    path('api/user/<str:username>/achievements/', views.user_achievements_api_view, name='user_achievements'),
    path('api/recent/', views.recent_workouts_view, name='recent_workouts'),
    path('api/update-workout-goal/', views.update_workout_goal_view, name='update_workout_goal'),
    path('api/calendar/', views.calendar_posts_view, name='calendar_posts'),

    # Active workout page
    path('<str:workout_id>/', views.active_workout_view, name='active_workout'),

    # Mobile API — active workout + log stats
    path('api/active/', views.api_active_workout_view, name='api_active_workout'),
    path('api/log/', views.log_workout_view, name='api_log_workout'),

    # Exercise catalog (for Add Exercise modal)
    path('api/catalog/', views.exercise_catalog_view, name='exercise_catalog'),

    # Templates
    path('api/templates/', views.get_templates_view, name='get_templates'),
    path('api/templates/<str:template_id>/', views.get_template_detail_view, name='get_template_detail'),
    path('templates/<str:template_id>/start/', views.start_from_template_view, name='start_from_template'),
    path('templates/<str:template_id>/delete/', views.delete_template_view, name='delete_template'),
    path('templates/<str:template_id>/update-from-workout/', views.update_template_from_workout_view, name='update_template_from_workout'),

    # Add exercise to workout
    path('<str:workout_id>/add-exercise/', views.add_exercise_view, name='add_exercise'),
    path('<str:workout_id>/add-custom-exercise/', views.add_custom_exercise_view, name='add_custom_exercise'),

    # Set operations
    path('exercise/<str:exercise_id>/add-set/', views.add_set_view, name='add_set'),
    path('set/<str:set_id>/update/', views.update_set_view, name='update_set'),
    path('set/<str:set_id>/delete/', views.delete_set_view, name='delete_set'),

    # Exercise operations
    path('exercise/<str:exercise_id>/delete/', views.delete_exercise_view, name='delete_exercise'),

    # Delete workout (clear/cancel)
    path('<str:workout_id>/delete/', views.delete_workout_view, name='delete_workout'),

    # Finish workout
    path('<str:workout_id>/finish/', views.finish_workout_view, name='finish_workout'),

    # View workout (read-only)
    path('<str:workout_id>/view/', views.view_workout_view, name='view_workout'),

    # Add workout to templates
    path('<str:workout_id>/add-to-templates/', views.add_workout_to_templates_view, name='add_to_templates'),

    # Personal records
    path('personal-record/create/', views.create_personal_record_view, name='create_personal_record'),
]
