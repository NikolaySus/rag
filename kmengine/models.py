"""Models"""

from django.db import models
from django.db.models import Q, CheckConstraint

CONFIG_TYPE_CHOICES = [
    ('calculation', 'Calculation'),
    ('database', 'Database'),
]

STATUS_CHOICES = [
    ('running', 'Running'),
    ('ok', 'Ok'),
    ('fail', 'Fail'),
]

class Config(models.Model):
    """Config model"""
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=15, choices=CONFIG_TYPE_CHOICES)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            CheckConstraint(
                check=Q(type__in=[choice[0] for choice in CONFIG_TYPE_CHOICES]),
                name="config_type_valid"
            ),
        ]

class Calculation(models.Model):
    """Calculation model"""
    config = models.ForeignKey(Config, on_delete=models.CASCADE, default=0, related_name='calculations')
    status = models.CharField(max_length=7, choices=STATUS_CHOICES, default='running')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            CheckConstraint(
                check=Q(status__in=[choice[0] for choice in STATUS_CHOICES]),
                name="calculation_status_valid"
            ),
        ]
