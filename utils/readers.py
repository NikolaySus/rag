"""Readers of different paths"""

from urllib.parse import urljoin
from markdownify import markdownify
from bs4 import BeautifulSoup
import httpx


async def html_to_md(client: httpx.AsyncClient, url: str) -> str:
    """Download html by url and convert to md"""
    try:
        timeout = 5
        response = await client.get(url=url, timeout=timeout)
        if not response.is_success:
            return ""
        html_content = response.text
        soup = BeautifulSoup(html_content, 'html.parser')
        for tag in soup.find_all(['a', 'link', 'script', 'img']):
            attr = 'href' if tag.name in ['a', 'link'] else 'src'
            if tag.has_attr(attr):
                tag[attr] = urljoin(url, tag[attr])
        return markdownify(str(soup).replace(url + '#', ""))
    except Exception as e:
        return ""
