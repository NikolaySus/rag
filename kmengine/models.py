"""Models"""

from django.db import models

class Config(models.Model):
    """Config model"""
    CONFIG_TYPE_CHOICES = [
        ('calculation', 'Calculation'),
        ('database', 'Database'),
    ]

    name = models.CharField(max_length=255)
    type = models.CharField(max_length=15, choices=CONFIG_TYPE_CHOICES)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class Calculation(models.Model):
    """Calculation model"""
    STATUS_CHOICES = [
        ('running', 'Running'),
        ('ok', 'Ok'),
        ('fail', 'Fail'),
    ]

    config = models.ForeignKey(Config, on_delete=models.DO_NOTHING, default=0, related_name='calculations')
    status = models.CharField(max_length=7, choices=STATUS_CHOICES, default='running')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
