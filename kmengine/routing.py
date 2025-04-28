# kmengine/routing.py
from django.urls import re_path

from . import consumers

kme_websocket_urlpatterns = [
    re_path(r"ws/kmengine/$", consumers.KMEConsumer.as_asgi()),
]
