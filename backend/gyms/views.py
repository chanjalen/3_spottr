import csv
import datetime
import requests

from django.contrib.auth.decorators import login_required
from django.db.models import Avg, Count
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.views.generic import ListView, DetailView

from .models import Gym, BusyLevel
from . import services


class GymGenericListView(ListView):
    """
    Generic ListView for displaying all gyms.
    Enriches each gym with busy level and enrollment data.
    Handles both GET (default list) and POST (server-side search/filter).
    """
    model = Gym
    template_name = 'gyms/gym_list_generic.html'
    context_object_name = 'gyms'

    def get_queryset(self):
        return super().get_queryset()

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        gyms = list(context['gyms'])
        enrolled_gym_ids = set()
        if self.request.user.is_authenticated:
            enrolled_gym_ids = set(self.request.user.enrolled_gyms.values_list('id', flat=True))
        for gym in gyms:
            gym_id = str(gym.id)
            busy = services.get_current_busy_level(gym_id)
            gym.busy_level = busy['level']
            gym.busy_label = busy['label'] or 'No data'
            gym.busy_responses = busy['total_responses']
            gym.enrolled_count = services.get_enrolled_users_count(gym)
            gym.is_enrolled = False
            if self.request.user.is_authenticated:
                gym.is_enrolled = gym.id in enrolled_gym_ids
            # Top total lifter
            top_lifters = services.get_top_lifters(gym_id, lift='total')
            if top_lifters:
                gym.top_lifter_name = top_lifters[0]['display_name']
                gym.top_lifter_username = top_lifters[0]['username']
                gym.top_lifter_avatar_url = top_lifters[0]['avatar_url']
                gym.top_lifter_total = top_lifters[0]['value']
                gym.top_lifter_unit = top_lifters[0]['unit']
            else:
                gym.top_lifter_name = None
                gym.top_lifter_username = None
                gym.top_lifter_avatar_url = None
                gym.top_lifter_total = None
                gym.top_lifter_unit = None
        context['gyms'] = gyms
        # Aggregations: total gym count and per-gym busy response counts
        context['total_gym_count'] = Gym.objects.count()
        context['gyms_with_data'] = BusyLevel.objects.values('gym__name').annotate(
            response_count=Count('id')
        ).order_by('-response_count')
        return context



class GymDetailView(DetailView):
    """
    Generic DetailView for displaying a single gym.
    Enriches context with busy level, invites, and leaderboard.
    """
    model = Gym
    template_name = 'gyms/gym_detail.html'
    context_object_name = 'gym'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        gym = self.object
        gym_id = str(gym.id)

        # Busy level
        busy = services.get_current_busy_level(gym_id)
        context['busy_level'] = busy['level']
        context['busy_label'] = busy['label'] or 'No data'
        context['busy_responses'] = busy['total_responses']

        # Enrollment
        context['enrolled_count'] = services.get_enrolled_users_count(gym)
        context['is_enrolled'] = False
        if self.request.user.is_authenticated:
            context['is_enrolled'] = self.request.user.enrolled_gyms.filter(id=gym.id).exists()

        # Workout invites for this gym
        context['invites'] = []
        if self.request.user.is_authenticated:
            invites = services.list_workout_invites(
                self.request.user, gym_id=gym_id
            )
            context['invites'] = invites

        return context


@login_required
def top_lifters_view(request, pk):
    """GET: top lifters at a gym for a given lift category."""
    lift = request.GET.get('lift', 'bench')
    lifters = services.get_top_lifters(str(pk), lift)
    return JsonResponse({'success': True, 'lifters': lifters})


# ── Internal summary API (chart-ready) ───────────────────────────────────────

def gym_summary_api(request):
    """
    GET /gyms/api/summary/
    Returns gym enrollment counts and average ratings — ready for Vega-Lite bar chart.
    No authentication required so classmates can access after deployment.
    """
    gyms = Gym.objects.annotate(member_count=Count('enrolled_users'))
    data = [
        {
            'name': g.name,
            'member_count': g.member_count,
            'rating': float(g.rating) if g.rating else None,
        }
        for g in gyms
    ]
    return JsonResponse(data, safe=False)


def busy_level_summary_api(request):
    """
    GET /gyms/api/busy-summary/
    Returns average busy level per hour-of-day aggregated across all gyms.
    Suitable for a Vega-Lite line chart.
    No authentication required.
    """
    from django.db.models.functions import ExtractHour
    rows = (
        BusyLevel.objects
        .annotate(hour=ExtractHour('timestamp'))
        .values('hour')
        .annotate(avg_level=Avg('survey_response'), total=Count('id'))
        .order_by('hour')
    )
    data = [
        {'hour': r['hour'], 'avg_level': round(r['avg_level'], 2), 'total_responses': r['total']}
        for r in rows
    ]
    return JsonResponse(data, safe=False)


# ── External API integration ──────────────────────────────────────────────────

def exercise_search_view(request):
    """
    GET /gyms/exercise-search/?q=<exercise_name>
    Fetches exercise information from the wger public API (no key required).
    Combines external data with our internal PR count for that exercise name.
    """
    query = request.GET.get('q', '').strip()
    if not query:
        return JsonResponse({'error': 'Provide a search term via ?q='}, status=400)

    try:
        resp = requests.get(
            'https://wger.de/api/v2/exercise/search/',
            params={'term': query, 'language': 'english', 'format': 'json'},
            timeout=5,
        )
        resp.raise_for_status()
        external_data = resp.json()
    except requests.RequestException as exc:
        return JsonResponse({'error': f'External API error: {exc}'}, status=502)

    suggestions = external_data.get('suggestions', [])

    # Combine with internal PR count for matched exercise names
    from workouts.models import PersonalRecord
    results = []
    for s in suggestions:
        name = s.get('value', '')
        pr_count = PersonalRecord.objects.filter(exercise_name__iexact=name).count()
        results.append({
            'exercise': name,
            'category': s.get('data', {}).get('category', ''),
            'spottr_pr_count': pr_count,
        })

    return JsonResponse({'query': query, 'results': results})


# ── CSV export ────────────────────────────────────────────────────────────────

def gym_csv_export(request):
    """
    GET /gyms/export/csv/
    Downloads all gyms as a CSV file.
    """
    now = datetime.datetime.now().strftime('%Y-%m-%d_%H-%M')
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="gyms_{now}.csv"'

    writer = csv.writer(response)
    writer.writerow(['id', 'name', 'address', 'rating', 'rating_count', 'website', 'created_at'])
    for g in Gym.objects.all().order_by('name'):
        writer.writerow([
            str(g.id),
            g.name,
            g.address or '',
            g.rating or '',
            g.rating_count or '',
            g.website or '',
            g.created_at.strftime('%Y-%m-%d'),
        ])
    return response


# ── JSON export ───────────────────────────────────────────────────────────────

def gym_json_export(request):
    """
    GET /gyms/export/json/
    Downloads all gyms as a formatted JSON file with metadata.
    """
    gyms = list(
        Gym.objects.all().order_by('name').values(
            'id', 'name', 'address', 'rating', 'rating_count', 'website', 'created_at'
        )
    )
    for g in gyms:
        g['id'] = str(g['id'])
        g['created_at'] = g['created_at'].strftime('%Y-%m-%dT%H:%M:%S') if g['created_at'] else None
        g['rating'] = float(g['rating']) if g['rating'] else None

    payload = {
        'generated_at': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        'record_count': len(gyms),
        'gyms': gyms,
    }

    now = datetime.datetime.now().strftime('%Y-%m-%d_%H-%M')
    response = JsonResponse(payload, json_dumps_params={'indent': 2})
    response['Content-Disposition'] = f'attachment; filename="gyms_{now}.json"'
    return response


# ── Reports page ──────────────────────────────────────────────────────────────

def reports_view(request):
    """
    GET /gyms/reports/
    HTML page showing grouped summaries, totals, and export links.
    """
    gyms_by_member_count = (
        Gym.objects.annotate(member_count=Count('enrolled_users'))
        .order_by('-member_count')
    )
    busy_by_gym = (
        BusyLevel.objects.values('gym__name')
        .annotate(response_count=Count('id'), avg_level=Avg('survey_response'))
        .order_by('-response_count')
    )
    total_gyms = Gym.objects.count()
    total_busy_responses = BusyLevel.objects.count()

    return render(request, 'gyms/reports.html', {
        'gyms_by_member_count': gyms_by_member_count,
        'busy_by_gym': busy_by_gym,
        'total_gyms': total_gyms,
        'total_busy_responses': total_busy_responses,
    })


# ── Vega-Lite chart pages ─────────────────────────────────────────────────────

def chart1_view(request):
    """Bar chart: gym membership counts."""
    return render(request, 'gyms/chart1.html')


def chart2_view(request):
    """Line chart: average gym busy level by hour of day."""
    return render(request, 'gyms/chart2.html')
