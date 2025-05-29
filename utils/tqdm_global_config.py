# tqdm_global_config.py
import tqdm

_original_tqdm = tqdm.tqdm

def custom_tqdm(*args, **kwargs):
    kwargs.setdefault('ncols', 80)
    return _original_tqdm(*args, **kwargs)

tqdm.tqdm = custom_tqdm

# Also patch tqdm.auto, which many libraries use
try:
    import tqdm.auto
    tqdm.auto.tqdm = custom_tqdm
except ImportError:
    pass
