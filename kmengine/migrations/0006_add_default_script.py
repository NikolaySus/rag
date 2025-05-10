from django.db import migrations

def create_default_script(apps, schema_editor):
    Script = apps.get_model('kmengine', 'Script')
    Script.objects.create(path="components.default", hidden=True)

class Migration(migrations.Migration):

    dependencies = [
        ('kmengine', '0005_script'),
    ]

    operations = [
        migrations.RunPython(create_default_script),
    ]