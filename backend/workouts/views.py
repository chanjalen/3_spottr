import json
from datetime import timedelta, date
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST, require_GET
from django.utils import timezone
from django.db.models import F
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response as DRFResponse

from .models import Workout, Exercise, ExerciseCatalog, ExerciseSet, PersonalRecord, Streak, RestDay
from social.models import Post


def _is_api_request(request):
    """Return True when the caller is a mobile token-auth client."""
    return request.headers.get('Authorization', '').startswith('Token ')


def _serialize_workout(workout):
    """Return a JSON-safe dict for one Workout with its exercises + sets."""
    exercises = Exercise.objects.filter(workout=workout).prefetch_related('exercise_sets').order_by('order')
    exercises_data = []
    for ex in exercises:
        sets_data = [
            {
                'id': str(s.id),
                'set_number': s.set_number,
                'reps': s.reps,
                'weight': float(s.weight),
                'completed': s.completed,
            }
            for s in ex.exercise_sets.all()
        ]
        exercises_data.append({
            'id': str(ex.id),
            'name': ex.name,
            'category': ex.category,
            'order': ex.order,
            'sets': sets_data,
        })

    duration_secs = workout.duration.total_seconds() if workout.duration else 0
    is_active = duration_secs <= 2

    return {
        'id': str(workout.id),
        'name': workout.name,
        'started_at': workout.start_time.isoformat() if workout.start_time else None,
        'finished_at': None if is_active else (workout.end_time.isoformat() if workout.end_time else None),
        'duration': None if is_active else duration_secs,
        'notes': workout.notes or '',
        'exercises': exercises_data,
        'exercise_count': len(exercises_data),
        'total_sets': sum(len(e['sets']) for e in exercises_data),
        'is_active': is_active,
    }


@login_required
def log_workout_view(request):
    """
    Display the Log Workout page with options to start empty workout or choose template.
    Also shows this week's stats and recent workouts.
    When called by mobile (Token auth) returns JSON.
    """
    user = request.user

    # Get this week's stats
    today = timezone.now().date()
    week_start = today - timedelta(days=today.weekday())

    week_workouts = list(Workout.objects.filter(
        user=user,
        start_time__date__gte=week_start
    ))

    workouts_count = len(week_workouts)
    total_time = sum((w.duration.total_seconds() for w in week_workouts if w.duration), 0)
    total_sets = sum(
        ExerciseSet.objects.filter(exercise__workout=w).count()
        for w in week_workouts
    )

    # Get recent workouts (exclude active placeholder workouts from the history list)
    recent_workouts = list(Workout.objects.filter(
        user=user,
    ).order_by('-start_time')[:10])

    if _is_api_request(request):
        from social.views import get_time_ago

        hours_total = int(total_time) // 3600
        mins_total = (int(total_time) % 3600) // 60
        total_time_str = f"{hours_total}h {mins_total}m" if hours_total > 0 else f"{mins_total}m"

        recent_list = []
        for w in recent_workouts:
            dur_secs = int(w.duration.total_seconds()) if w.duration else 0
            h = dur_secs // 3600
            m = (dur_secs % 3600) // 60
            dur_str = f"{h}h {m}m" if h > 0 else f"{m}m"
            ex_count = Exercise.objects.filter(workout=w).count()
            s_count = ExerciseSet.objects.filter(exercise__workout=w).count()
            recent_list.append({
                'id': str(w.id),
                'name': w.name,
                'duration': dur_str,
                'duration_seconds': dur_secs,
                'exercise_count': ex_count,
                'total_sets': s_count,
                'started_at': w.start_time.isoformat() if w.start_time else None,
                'time_ago': get_time_ago(w.start_time) if w.start_time else '',
                'is_active': dur_secs <= 2,
            })

        return JsonResponse({
            'workouts_count': workouts_count,
            'total_time': total_time_str,
            'total_time_seconds': int(total_time),
            'total_sets': total_sets,
            'recent_workouts': recent_list,
        })

    return render(request, 'workouts/log_workout.html', {
        'workouts_count': workouts_count,
        'total_time_hours': round(total_time / 3600, 1),
        'total_sets': total_sets,
        'recent_workouts': recent_workouts,
    })


@api_view(['POST'])
def start_workout_view(request):
    """
    Start a new empty workout session.
    Creates a workout with start_time set to now.
    """
    now = timezone.now()
    workout = Workout.objects.create(
        user=request.user,
        name='Workout',
        type='custom',
        start_time=now,
        end_time=now + timedelta(seconds=1),  # Placeholder - will be updated when finished
        duration=timedelta(seconds=1),  # Will be calculated when finished
    )

    return JsonResponse({
        'success': True,
        'workout_id': str(workout.id),
    })


@login_required
def active_workout_view(request, workout_id):
    """
    Display the active workout page where user can add exercises and track sets.
    When called by mobile (Token auth) returns JSON.
    """
    workout = get_object_or_404(Workout, id=workout_id, user=request.user)

    if _is_api_request(request):
        return JsonResponse(_serialize_workout(workout))

    exercises = Exercise.objects.filter(workout=workout).prefetch_related('exercise_sets')
    return render(request, 'workouts/active_workout.html', {
        'workout': workout,
        'exercises': exercises,
    })


@api_view(['GET'])
def api_active_workout_view(request):
    """
    Return the user's most recent active (unfinished) workout as JSON, or null.
    An 'active' workout has duration <= 2 seconds (placeholder set by start_workout_view).
    """
    active = Workout.objects.filter(
        user=request.user,
        duration__lte=timedelta(seconds=2),
    ).order_by('-start_time').first()

    if not active:
        return JsonResponse({'active': None})

    return JsonResponse({'active': _serialize_workout(active)})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def exercise_catalog_view(request):
    """
    Mobile API: get exercise catalog as a flat list.
    Supports DRF token auth (mobile) and session auth (web).
    Query params: q (search), category (filter by category slug).
    """
    q = request.GET.get('q', '').strip()
    category = request.GET.get('category', '').strip()

    exercises = ExerciseCatalog.objects.all()

    if q:
        exercises = exercises.filter(name__icontains=q)
    if category and category.lower() != 'all':
        exercises = exercises.filter(category__iexact=category)

    results = [
        {
            'id': str(e.id),
            'name': e.name,
            'category': e.get_category_display(),
            'muscle_group': e.get_category_display(),
        }
        for e in exercises
    ]
    return DRFResponse(results)




@api_view(['POST'])
def add_exercise_view(request, workout_id):
    """
    Add an exercise to the workout.
    """
    workout = get_object_or_404(Workout, id=workout_id, user=request.user)

    catalog_id = request.data.get('catalog_id')

    catalog_exercise = get_object_or_404(ExerciseCatalog, id=catalog_id)

    # Get the next order number
    last_exercise = Exercise.objects.filter(workout=workout).order_by('-order').first()
    next_order = (last_exercise.order + 1) if last_exercise else 1

    # Create the exercise
    exercise = Exercise.objects.create(
        workout=workout,
        name=catalog_exercise.name,
        category=catalog_exercise.category,
        sets=0,
        reps=0,
        weight=0,
        unit='lbs',
        order=next_order,
    )

    # Create default sets based on catalog
    for i in range(1, catalog_exercise.default_sets + 1):
        ExerciseSet.objects.create(
            exercise=exercise,
            set_number=i,
            reps=0,
            weight=0,
            completed=False,
        )

    return JsonResponse({
        'success': True,
        'exercise': {
            'id': str(exercise.id),
            'name': exercise.name,
            'category': exercise.category,
            'order': exercise.order,
            'sets': list(exercise.exercise_sets.values('id', 'set_number', 'reps', 'weight', 'completed')),
        }
    })


@api_view(['POST'])
def add_custom_exercise_view(request, workout_id):
    """
    Add a custom exercise to the workout (not from catalog).
    """
    workout = get_object_or_404(Workout, id=workout_id, user=request.user)

    exercise_name = request.data.get('name', '').strip()

    if not exercise_name:
        return JsonResponse({
            'success': False,
            'error': 'Exercise name is required'
        }, status=400)

    # Get the next order number
    last_exercise = Exercise.objects.filter(workout=workout).order_by('-order').first()
    next_order = (last_exercise.order + 1) if last_exercise else 1

    # Create the exercise with 'other' category
    exercise = Exercise.objects.create(
        workout=workout,
        name=exercise_name,
        category='other',
        sets=0,
        reps=0,
        weight=0,
        unit='lbs',
        order=next_order,
    )

    # Create 3 default sets
    for i in range(1, 4):
        ExerciseSet.objects.create(
            exercise=exercise,
            set_number=i,
            reps=0,
            weight=0,
            completed=False,
        )

    return JsonResponse({
        'success': True,
        'exercise': {
            'id': str(exercise.id),
            'name': exercise.name,
            'category': exercise.category,
            'order': exercise.order,
            'sets': list(exercise.exercise_sets.values('id', 'set_number', 'reps', 'weight', 'completed')),
        }
    })


@api_view(['POST'])
def add_set_view(request, exercise_id):
    """
    Add a new set to an exercise.
    """
    exercise = get_object_or_404(Exercise, id=exercise_id, workout__user=request.user)

    # Get the next set number
    last_set = exercise.exercise_sets.order_by('-set_number').first()
    next_set_number = (last_set.set_number + 1) if last_set else 1

    exercise_set = ExerciseSet.objects.create(
        exercise=exercise,
        set_number=next_set_number,
        reps=0,
        weight=0,
        completed=False,
    )

    return JsonResponse({
        'success': True,
        'set': {
            'id': str(exercise_set.id),
            'set_number': exercise_set.set_number,
            'reps': exercise_set.reps,
            'weight': float(exercise_set.weight),
            'completed': exercise_set.completed,
        }
    })


@api_view(['POST'])
def update_set_view(request, set_id):
    """
    Update a set's reps, weight, or completed status.
    """
    exercise_set = get_object_or_404(
        ExerciseSet,
        id=set_id,
        exercise__workout__user=request.user
    )

    data = request.data

    if 'reps' in data:
        exercise_set.reps = max(0, int(data['reps']))
    if 'weight' in data:
        exercise_set.weight = max(0, float(data['weight']))
    if 'completed' in data:
        exercise_set.completed = bool(data['completed'])

    exercise_set.save()

    response_data = {
        'success': True,
        'set': {
            'id': exercise_set.id,
            'set_number': exercise_set.set_number,
            'reps': exercise_set.reps,
            'weight': float(exercise_set.weight),
            'completed': exercise_set.completed,
        }
    }

    # Check for PR whenever the set has weight > 0
    if exercise_set.weight > 0:
        exercise_name = exercise_set.exercise.name
        existing_pr = PersonalRecord.objects.filter(
            user=request.user,
            exercise_name__iexact=exercise_name,
        ).first()

        set_weight = float(exercise_set.weight)

        if existing_pr and existing_pr.unit in ('lbs', 'kg'):
            try:
                pr_value = float(existing_pr.value)
                if set_weight > pr_value:
                    response_data['is_new_pr'] = True
                    response_data['pr_exercise'] = exercise_name
                    response_data['pr_value'] = str(int(set_weight) if set_weight == int(set_weight) else set_weight)
                    response_data['pr_unit'] = existing_pr.unit
                    response_data['old_pr_value'] = existing_pr.value
            except (ValueError, TypeError):
                pass
        elif not existing_pr:
            # No PR exists yet — this is their first recorded weight for this exercise
            response_data['is_new_pr'] = True
            response_data['pr_exercise'] = exercise_name
            response_data['pr_value'] = str(int(set_weight) if set_weight == int(set_weight) else set_weight)
            response_data['pr_unit'] = 'lbs'
            response_data['old_pr_value'] = None

    return JsonResponse(response_data)


@api_view(['POST'])
def delete_set_view(request, set_id):
    """
    Delete a set from an exercise.
    """
    exercise_set = get_object_or_404(
        ExerciseSet,
        id=set_id,
        exercise__workout__user=request.user
    )

    exercise_set.delete()

    return JsonResponse({'success': True})


@api_view(['POST'])
def delete_exercise_view(request, exercise_id):
    """
    Delete an exercise from the workout.
    """
    exercise = get_object_or_404(Exercise, id=exercise_id, workout__user=request.user)
    exercise.delete()

    return JsonResponse({'success': True})


@api_view(['POST'])
def delete_workout_view(request, workout_id):
    """
    Delete an incomplete workout (clear/cancel workout).
    """
    workout = get_object_or_404(Workout, id=workout_id, user=request.user)
    workout.delete()

    return JsonResponse({'success': True})


@api_view(['POST'])
def finish_workout_view(request, workout_id):
    """
    Finish the workout, calculate duration, and optionally post to feed.
    Supports both JSON and multipart/form-data for file uploads.
    """
    from .models import WorkoutTemplate, TemplateExercise

    workout = get_object_or_404(Workout, id=workout_id, user=request.user)

    # Handle both JSON and form data
    content_type = request.content_type or ''
    if 'multipart/form-data' in content_type:
        # Form data with file upload
        data = {
            'notes': request.POST.get('notes', ''),
            'name': request.POST.get('name', ''),
            'save_template': request.POST.get('save_template') == 'true',
            'template_name': request.POST.get('template_name', ''),
            'post_to_feed': request.POST.get('post_to_feed', 'true') == 'true',
            'visibility': request.POST.get('visibility', 'main'),
        }
        photo = request.FILES.get('photo')
    else:
        # JSON data
        data = request.data
        photo = None

    # Update end time and calculate duration
    workout.end_time = timezone.now()
    workout.duration = workout.end_time - workout.start_time
    workout.notes = data.get('notes', '')

    if data.get('name'):
        workout.name = data['name']

    workout.save()

    # Calculate stats
    exercises = Exercise.objects.filter(workout=workout).order_by('order')
    exercise_count = exercises.count()
    total_sets = ExerciseSet.objects.filter(exercise__workout=workout).count()

    # Format duration for display
    total_seconds = int(workout.duration.total_seconds())
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60

    if hours > 0:
        duration_str = f"{hours}h {minutes}m"
    else:
        duration_str = f"{minutes}m"

    # Save as template if requested
    if data.get('save_template') and data.get('template_name'):
        template = WorkoutTemplate.objects.create(
            user=request.user,
            name=data['template_name'],
            description=f"Created from workout on {workout.end_time.strftime('%B %d, %Y')}",
            visibility='private',
        )

        # Create template exercises from workout exercises
        for idx, exercise in enumerate(exercises):
            # Get the sets for this exercise to determine default values
            exercise_sets = exercise.exercise_sets.all()

            # Use actual values from the first set (most representative)
            if exercise_sets.exists():
                first_set = exercise_sets.first()
                default_reps = first_set.reps if first_set.reps > 0 else 10
                default_weight = float(first_set.weight) if first_set.weight else 0
                sets_count = exercise_sets.count()
            else:
                default_reps = 10
                default_weight = 0
                sets_count = 3

            TemplateExercise.objects.create(
                template=template,
                name=exercise.name,
                category=exercise.category or 'other',
                sets=sets_count,
                reps=default_reps,
                weight=default_weight,
                unit=exercise.unit or 'lbs',
                order_index=idx,
            )

    # Create a post if posting to feed
    if data.get('post_to_feed', True):
        # Build exercise summary
        exercise_names = [e.name for e in exercises[:3]]
        exercise_summary = ', '.join(exercise_names)
        if exercise_count > 3:
            exercise_summary += f" +{exercise_count - 3} more"

        description = f"Completed a {duration_str} workout"
        if exercise_count > 0:
            description += f" with {exercise_count} exercises and {total_sets} sets"
        if workout.notes:
            description += f"\n\n{workout.notes}"

        visibility = data.get('visibility', 'main')
        if visibility not in ('main', 'friends'):
            visibility = 'main'

        post = Post.objects.create(
            user=request.user,
            workout=workout,
            location=workout.gym,
            description=description,
            visibility=visibility,
        )

        # Save photo if provided
        if photo:
            post.photo = photo
            post.save()

        # Save PR data if attached
        pr_data_raw = request.POST.get('pr_data') if 'multipart/form-data' in content_type else data.get('pr_data')
        if pr_data_raw:
            from accounts.views import is_new_pr_better
            pr_list = json.loads(pr_data_raw) if isinstance(pr_data_raw, str) else pr_data_raw
            for pr_item in pr_list:
                ex_name = pr_item.get('exercise_name', '').strip()
                pr_val = pr_item.get('value', '').strip()
                pr_unit = pr_item.get('unit', 'lbs')
                if not ex_name or not pr_val:
                    continue

                existing_pr = PersonalRecord.objects.filter(
                    user=request.user,
                    exercise_name__iexact=ex_name,
                ).first()

                if existing_pr:
                    if is_new_pr_better(pr_val, pr_unit, existing_pr.value, existing_pr.unit):
                        existing_pr.value = pr_val
                        existing_pr.unit = pr_unit
                        existing_pr.achieved_date = timezone.now().date()
                        existing_pr.post = post
                        existing_pr.save()
                else:
                    PersonalRecord.objects.create(
                        user=request.user,
                        post=post,
                        exercise_name=ex_name,
                        value=pr_val,
                        unit=pr_unit,
                        achieved_date=timezone.now().date(),
                    )

    # Always update streak and workout count, regardless of post_to_feed
    from workouts.services.streak_service import update_streak
    from groups.services import update_group_streaks_for_user
    update_streak(request.user, activity_type='workout')
    update_group_streaks_for_user(request.user)

    request.user.total_workouts = F('total_workouts') + 1
    request.user.save(update_fields=['total_workouts'])

    return JsonResponse({
        'success': True,
        'workout': {
            'id': str(workout.id),
            'name': workout.name,
            'duration': str(workout.duration),
            'duration_seconds': workout.duration.total_seconds(),
            'exercise_count': exercise_count,
            'total_sets': total_sets,
        }
    })


@api_view(['GET'])
def get_templates_view(request):
    """
    Get all workout templates for the current user.
    """
    from .models import WorkoutTemplate

    templates = WorkoutTemplate.objects.filter(user=request.user).prefetch_related('exercises')

    template_list = []
    for template in templates:
        exercises = template.exercises.all()
        template_list.append({
            'id': str(template.id),
            'name': template.name,
            'description': template.description,
            'exercise_count': exercises.count(),
            'exercises': [
                {
                    'name': e.name,
                    'sets': e.sets,
                    'reps': e.reps,
                }
                for e in exercises[:3]
            ],
            'created_at': template.created_at.isoformat(),
        })

    return JsonResponse({
        'success': True,
        'templates': template_list,
    })


@api_view(['POST'])
def start_from_template_view(request, template_id):
    """
    Start a new workout from a template.
    Creates a workout with exercises pre-populated from the template.
    """
    from .models import WorkoutTemplate

    template = get_object_or_404(WorkoutTemplate, id=template_id, user=request.user)

    # Create the workout
    now = timezone.now()
    workout = Workout.objects.create(
        user=request.user,
        name=template.name,
        type='template',
        template=template,
        start_time=now,
        end_time=now + timedelta(seconds=1),
        duration=timedelta(seconds=1),
    )

    # Create exercises from template
    for template_exercise in template.exercises.all():
        exercise = Exercise.objects.create(
            workout=workout,
            name=template_exercise.name,
            category=template_exercise.category,
            sets=template_exercise.sets,
            reps=template_exercise.reps,
            weight=template_exercise.weight,
            unit=template_exercise.unit,
            order=template_exercise.order_index,
        )

        # Create sets based on template
        for i in range(1, template_exercise.sets + 1):
            ExerciseSet.objects.create(
                exercise=exercise,
                set_number=i,
                reps=template_exercise.reps,
                weight=template_exercise.weight,
                completed=False,
            )

    return JsonResponse({
        'success': True,
        'workout_id': str(workout.id),
    })


@api_view(['POST'])
def delete_template_view(request, template_id):
    """
    Delete a workout template.
    """
    from .models import WorkoutTemplate

    template = get_object_or_404(WorkoutTemplate, id=template_id, user=request.user)
    template.delete()

    return JsonResponse({'success': True})


@login_required
def view_workout_view(request, workout_id):
    """
    View a workout in read-only mode.
    Any user can view any workout (for shared posts).
    """
    workout = get_object_or_404(Workout, id=workout_id)

    exercises = Exercise.objects.filter(workout=workout).prefetch_related('exercise_sets').order_by('order')

    # Calculate stats
    total_sets = ExerciseSet.objects.filter(exercise__workout=workout).count()

    # Format duration
    if workout.duration:
        total_seconds = int(workout.duration.total_seconds())
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        if hours > 0:
            duration_str = f"{hours}h {minutes}m"
        else:
            duration_str = f"{minutes}m"
    else:
        duration_str = "--"

    # Check if this is the user's own workout
    is_owner = workout.user == request.user

    return render(request, 'workouts/view_workout.html', {
        'workout': workout,
        'exercises': exercises,
        'total_sets': total_sets,
        'duration_str': duration_str,
        'is_owner': is_owner,
    })


@api_view(['POST'])
def add_workout_to_templates_view(request, workout_id):
    """
    Add another user's workout to your templates.
    Creates a copy of the workout as a template for the current user.
    """
    from .models import WorkoutTemplate, TemplateExercise

    workout = get_object_or_404(Workout, id=workout_id)

    data = request.data
    template_name = data.get('name', '').strip() or f"{workout.name} (copied)"

    # Create the template
    template = WorkoutTemplate.objects.create(
        user=request.user,
        name=template_name,
        description=f"Copied from {workout.user.display_name}'s workout",
        visibility='private',
    )

    # Copy exercises from the workout
    exercises = Exercise.objects.filter(workout=workout).order_by('order')

    for idx, exercise in enumerate(exercises):
        exercise_sets = exercise.exercise_sets.all()

        # Get actual values from the first set, or defaults
        if exercise_sets.exists():
            first_set = exercise_sets.first()
            reps = first_set.reps or 10
            weight = float(first_set.weight) if first_set.weight else 0
            sets_count = exercise_sets.count()
        else:
            reps = 10
            weight = 0
            sets_count = 3

        TemplateExercise.objects.create(
            template=template,
            name=exercise.name,
            category=exercise.category or 'other',
            sets=sets_count,
            reps=reps,
            weight=weight,
            unit=exercise.unit or 'lbs',
            order_index=idx,
        )

    return JsonResponse({
        'success': True,
        'template_id': str(template.id),
        'template_name': template.name,
    })


@login_required
@require_POST
def create_personal_record_view(request):
    """
    Create a new personal record.
    Optionally creates a post to share to the feed.
    """
    # Handle form data (for file uploads)
    exercise_name = request.POST.get('exercise_name', '').strip()
    value = request.POST.get('value', '').strip()
    unit = request.POST.get('unit', 'lbs')
    achieved_date_str = request.POST.get('achieved_date', '')
    post_to_feed = request.POST.get('post_to_feed', 'true').lower() == 'true'
    video = request.FILES.get('video')

    # Validation
    if not exercise_name:
        return JsonResponse({
            'success': False,
            'error': 'Exercise name is required'
        }, status=400)

    if not value:
        return JsonResponse({
            'success': False,
            'error': 'Value is required'
        }, status=400)

    # Parse date
    if achieved_date_str:
        try:
            achieved_date = date.fromisoformat(achieved_date_str)
        except ValueError:
            achieved_date = date.today()
    else:
        achieved_date = date.today()

    post = None

    # Create post first if sharing to feed
    if post_to_feed:
        description = f"New PR! {exercise_name}: {value} {unit}"
        post = Post.objects.create(
            user=request.user,
            description=description,
            visibility='main',
        )

    # Create the personal record
    pr = PersonalRecord.objects.create(
        user=request.user,
        post=post,
        exercise_name=exercise_name,
        value=value,
        unit=unit,
        achieved_date=achieved_date,
    )

    # Save video if provided
    if video:
        pr.video = video
        pr.save()

    return JsonResponse({
        'success': True,
        'pr_id': str(pr.id),
        'post_id': str(post.id) if post else None,
        'message': 'Personal Record saved!'
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def rest_day_view(request):
    """Record a rest day for the current user. Supports token auth for mobile."""
    from workouts.services.streak_service import record_rest_day
    result = record_rest_day(request.user)

    status_code = 200 if result['success'] else 400
    return DRFResponse(result, status=status_code)


@login_required
@require_GET
def streak_details_view(request):
    """Display the streak details page. Returns JSON for mobile (Token auth)."""
    from workouts.services.streak_service import get_streak_details, get_streak_date
    details = get_streak_details(request.user)

    if _is_api_request(request):
        from datetime import timedelta as _td
        today_streak = get_streak_date()
        days_since_sunday = (today_streak.weekday() + 1) % 7
        week_start = today_streak - _td(days=days_since_sunday)

        week_days_adapted = []
        for i, d in enumerate(details['week_days']):
            day_date = week_start + _td(days=i)
            if d.get('is_future'):
                status = 'pending'
            elif d.get('active'):
                status = 'workout'
            elif d.get('rest'):
                status = 'rest'
            else:
                status = 'pending'
            week_days_adapted.append({
                'date': day_date.isoformat(),
                'status': status,
            })

        return JsonResponse({
            'current_streak': details['current_streak'],
            'longest_streak': details['longest_streak'],
            'weekly_goal': details['weekly_workout_goal'],
            'workouts_this_week': details['weekly_workout_count'],
            'rest_days_used': details['rest_info']['rest_days_used'],
            'week_days': week_days_adapted,
        })

    return render(request, 'workouts/streak_details.html', details)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def streak_api_view(request):
    """Return streak details as JSON for mobile clients."""
    from workouts.services.streak_service import get_streak_details
    details = get_streak_details(request.user)
    return DRFResponse(details)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_workout_goal_view(request):
    """Update the user's weekly workout goal. Supports token auth for mobile."""
    try:
        # Accept 'goal' (mobile) or 'weekly_workout_goal' (web legacy)
        goal = int(request.data.get('goal') or request.data.get('weekly_workout_goal', 0))
    except (ValueError, TypeError):
        return DRFResponse({'success': False, 'error': 'Invalid data'}, status=400)

    if goal < 1 or goal > 7:
        return DRFResponse({'success': False, 'error': 'Goal must be between 1 and 7'}, status=400)

    request.user.weekly_workout_goal = goal
    request.user.save(update_fields=['weekly_workout_goal'])

    return DRFResponse({'success': True, 'weekly_workout_goal': goal})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def calendar_posts_view(request):
    """Return posts, check-ins, and rest days for a user for a given month.
    Accepts an optional `username` query param to view another user's calendar."""
    from social.models import QuickWorkout, Reaction, Comment
    from media.utils import get_media_url, build_media_url
    from django.db.models import Count, Exists, OuterRef

    try:
        year = int(request.query_params.get('year', timezone.now().year))
        month = int(request.query_params.get('month', timezone.now().month))
    except (ValueError, TypeError):
        return DRFResponse({'success': False, 'error': 'Invalid year/month'}, status=400)

    if not (1 <= month <= 12) or year < 2000:
        return DRFResponse({'success': False, 'error': 'Invalid year/month'}, status=400)

    username = request.query_params.get('username')
    if username:
        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return DRFResponse({'success': False, 'error': 'User not found'}, status=404)
    else:
        user = request.user

    checkins = QuickWorkout.objects.filter(
        user=user,
        created_at__year=year,
        created_at__month=month,
    ).annotate(
        like_count=Count('reactions', distinct=True),
        comment_count=Count('comments', distinct=True),
        user_liked=Exists(Reaction.objects.filter(quick_workout=OuterRef('pk'), user=user)),
    ).select_related('location').order_by('-created_at')

    posts = Post.objects.filter(
        user=user,
        created_at__year=year,
        created_at__month=month,
    ).annotate(
        like_count=Count('reactions', distinct=True),
        comment_count=Count('comments', distinct=True),
        user_liked=Exists(Reaction.objects.filter(post=OuterRef('pk'), user=user)),
    ).select_related('location', 'workout').order_by('-created_at')

    # Prefetch workout details
    workout_ids = [p.workout_id for p in posts if p.workout_id]
    exercise_counts = {}
    set_counts = {}
    if workout_ids:
        from django.db.models import Count as DjCount
        ex_rows = Exercise.objects.filter(workout_id__in=workout_ids).values('workout_id').annotate(cnt=DjCount('id'))
        for r in ex_rows:
            exercise_counts[r['workout_id']] = r['cnt']
        s_rows = ExerciseSet.objects.filter(exercise__workout_id__in=workout_ids).values('exercise__workout_id').annotate(cnt=DjCount('id'))
        for r in s_rows:
            set_counts[r['exercise__workout_id']] = r['cnt']

    items = []

    for qw in checkins:
        photo_url = get_media_url('quick_workout', str(qw.id))
        if not photo_url:
            path = f'checkins/{qw.id}.jpg'
            try:
                from django.core.files.storage import default_storage
                if default_storage.exists(path):
                    photo_url = build_media_url(path)
            except Exception:
                pass
        items.append({
            'id': str(qw.id),
            'type': 'checkin',
            'date': qw.created_at.strftime('%Y-%-m-%-d'),
            'description': qw.description or '',
            'photo_url': photo_url,
            'video_url': None,
            'location_name': qw.location_name or (qw.location.name if qw.location else ''),
            'like_count': qw.like_count,
            'comment_count': qw.comment_count,
            'user_liked': qw.user_liked,
            'workout_name': None,
            'workout_exercises': None,
            'workout_sets': None,
            'emoji': qw.type.replace('_', ' ').title() if qw.type else '',
        })

    for post in posts:
        photo_url = get_media_url('post', str(post.id)) or (build_media_url(post.photo.name) if post.photo else None)
        video_url = build_media_url(post.video.name) if post.video else None
        workout_name = None
        workout_exercises = None
        workout_sets = None
        if post.workout_id and post.workout:
            workout_name = post.workout.name
            workout_exercises = exercise_counts.get(post.workout_id, 0)
            workout_sets = set_counts.get(post.workout_id, 0)
        items.append({
            'id': str(post.id),
            'type': 'workout' if post.workout_id else 'post',
            'date': post.created_at.strftime('%Y-%-m-%-d'),
            'description': post.description or '',
            'photo_url': photo_url,
            'video_url': video_url,
            'location_name': post.location.name if post.location else '',
            'like_count': post.like_count,
            'comment_count': post.comment_count,
            'user_liked': post.user_liked,
            'workout_name': workout_name,
            'workout_exercises': workout_exercises,
            'workout_sets': workout_sets,
            'emoji': None,
        })

    # Append rest days for the month
    rest_days = RestDay.objects.filter(
        user=user,
        streak_date__year=year,
        streak_date__month=month,
    )
    for rd in rest_days:
        d = rd.streak_date
        items.append({
            'id': f'rest-{rd.id}',
            'type': 'rest',
            'date': f'{d.year}-{d.month}-{d.day}',
            'description': '',
            'photo_url': None,
            'video_url': None,
            'location_name': '',
            'like_count': 0,
            'comment_count': 0,
            'user_liked': False,
            'workout_name': None,
            'workout_exercises': None,
            'workout_sets': None,
            'emoji': None,
        })

    return DRFResponse({'success': True, 'posts': items})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def recent_workouts_view(request):
    """Return recent completed workouts for the logged-in user (for sharing in posts)."""
    from django.db.models import Count
    workouts = (
        Workout.objects.filter(user=request.user)
        .annotate(ex_count=Count('exercises', distinct=True))
        .order_by('-start_time')[:20]
    )
    data = []
    for w in workouts:
        dur = int(w.duration.total_seconds() / 60) if w.duration else 0
        data.append({
            'id': str(w.id),
            'name': w.name,
            'type': w.type,
            'started_at': w.start_time.isoformat(),
            'duration_minutes': dur,
            'exercise_count': w.ex_count,
        })
    return DRFResponse(data)
