
# Register your models here.
from django.contrib import admin
from .models import Gym, User, Workout, Exercise, Post

admin.site.register(Gym)
admin.site.register(User)
admin.site.register(Workout)
admin.site.register(Exercise)
admin.site.register(Post)
