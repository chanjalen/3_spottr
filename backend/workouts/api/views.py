from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


def _format_duration(duration):
    if not duration:
        return '0m'
    total_seconds = int(duration.total_seconds())
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    if hours > 0:
        return f'{hours}h {minutes}m'
    return f'{minutes}m'


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def workout_detail(request, workout_id):
    """
    Return full detail for a workout: all exercises with their individual sets.
    Used by the workout detail modal on feed cards.
    """
    from workouts.models import Workout, Exercise

    try:
        workout = Workout.objects.get(id=workout_id)
    except Workout.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    exercises = (
        Exercise.objects
        .filter(workout=workout)
        .prefetch_related('exercise_sets')
        .order_by('order')
    )

    exercises_data = []
    for ex in exercises:
        sets_data = [
            {
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
            'unit': ex.unit,
            'sets': sets_data,
        })

    return Response({
        'id': str(workout.id),
        'name': workout.name,
        'duration': _format_duration(workout.duration),
        'exercises': exercises_data,
    })
