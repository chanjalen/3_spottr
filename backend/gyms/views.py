from django.shortcuts import render
from django.http import HttpResponse
from django.template import loader
from django.views import View
from django.views.generic import ListView, DetailView

from .models import Gym


# View 1: HttpResponse (Manual)
# Using loader.get_template() and HttpResponse
def gym_list_manual(request):
    """
    Returns gym list using manual template loading with HttpResponse.
    """
    template = loader.get_template('gyms/gym_list_manual.html')
    gyms = Gym.objects.all()
    context = {'gyms': gyms}
    return HttpResponse(template.render(context, request))


# View 2: render() Shortcut
# Using the render() function with model queryset
def gym_list_render(request):
    """
    Returns gym list using render() shortcut.
    """
    gyms = Gym.objects.all()
    context = {'gyms': gyms}
    return render(request, 'gyms/gym_list_render.html', context)


# View 3: Base CBV (inherit from View)
# Manually implement get() and query the model
class GymListView(View):
    """
    Class-based view that inherits from django.views.View.
    Manually queries the model and returns a rendered template.
    """
    def get(self, request):
        gyms = Gym.objects.all()
        context = {'gyms': gyms}
        return render(request, 'gyms/gym_list_cbv.html', context)


# View 4: Generic CBV (inherit from Django generic views)
# Using ListView and DetailView
class GymGenericListView(ListView):
    """
    Generic ListView for displaying all gyms.
    """
    model = Gym
    template_name = 'gyms/gym_list_generic.html'
    context_object_name = 'gyms'


class GymDetailView(DetailView):
    """
    Generic DetailView for displaying a single gym.
    """
    model = Gym
    template_name = 'gyms/gym_detail.html'
    context_object_name = 'gym'
