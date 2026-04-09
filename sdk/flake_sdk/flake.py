"""
Flake SDK — Python library for reading and writing Flake memos.

Usage:
    from flake_sdk import Flake

    flake = Flake()

    # List all memos
    for memo in flake.list():
        print(memo.title)

    # Get a memo by title
    memo = flake.get(title="My Memo")
    print(memo.content)

    # Create a new memo
    memo = flake.create(title="Hello", content="World")

    # Update a memo
    memo.content = "Updated content"
    memo.save()

    # Delete a memo
    flake.delete(memo.id)

    # Search memos
    results = flake.search("keyword")
"""

import json
import os
import time
import random
import string
import re
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Optional, List


DATA_PATH = os.path.join(os.path.expanduser('~'), '.flake', 'data.json')


def _generate_id():
    ts = int(time.time() * 1000)
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=9))
    # Match JS: Date.now().toString(36) + random
    return _base36(ts) + rand


def _base36(n):
    chars = '0123456789abcdefghijklmnopqrstuvwxyz'
    if n == 0:
        return '0'
    result = ''
    while n > 0:
        result = chars[n % 36] + result
        n //= 36
    return result


def _strip_html(html: str) -> str:
    return re.sub(r'<[^>]*>', '', html)


@dataclass
class Memo:
    """Represents a single Flake memo."""
    id: str
    title: str
    content: str
    createdAt: str
    updatedAt: str
    images: list = field(default_factory=list)

    @property
    def text(self) -> str:
        """Get plain text content (HTML tags stripped)."""
        return _strip_html(self.content)

    @text.setter
    def text(self, value: str):
        """Set content as plain text (wraps in simple HTML)."""
        self.content = value.replace('\n', '<br>')

    @property
    def lines(self) -> List[str]:
        """Get content as a list of lines."""
        return _strip_html(self.content).split('\n')

    @lines.setter
    def lines(self, value: List[str]):
        """Set content from a list of lines."""
        self.content = '<br>'.join(value)

    @property
    def line_count(self) -> int:
        """Get the number of lines."""
        return len(self.lines)

    def get_line(self, n: int) -> str:
        """Get the nth line (1-based index)."""
        ls = self.lines
        if 1 <= n <= len(ls):
            return ls[n - 1]
        raise IndexError(f'Line {n} out of range (1-{len(ls)})')

    def set_line(self, n: int, text: str):
        """Set the nth line (1-based index) and save."""
        ls = self.lines
        if 1 <= n <= len(ls):
            ls[n - 1] = text
            self.lines = ls
            self.save()
        else:
            raise IndexError(f'Line {n} out of range (1-{len(ls)})')

    def insert_line(self, n: int, text: str):
        """Insert a line before line n (1-based). Appends if n > line_count."""
        ls = self.lines
        n = max(1, min(n, len(ls) + 1))
        ls.insert(n - 1, text)
        self.lines = ls
        self.save()

    def delete_line(self, n: int):
        """Delete the nth line (1-based index) and save."""
        ls = self.lines
        if 1 <= n <= len(ls):
            ls.pop(n - 1)
            self.lines = ls
            self.save()
        else:
            raise IndexError(f'Line {n} out of range (1-{len(ls)})')

    def get_lines(self, start: int, end: int) -> List[str]:
        """Get lines from start to end (1-based, inclusive)."""
        ls = self.lines
        start = max(1, start)
        end = min(len(ls), end)
        return ls[start - 1:end]

    def replace_lines(self, start: int, end: int, new_lines: List[str]):
        """Replace lines from start to end (1-based, inclusive) and save."""
        ls = self.lines
        start = max(1, start)
        end = min(len(ls), end)
        ls[start - 1:end] = new_lines
        self.lines = ls
        self.save()

    def append(self, text: str):
        """Append text (can be multi-line) to the end and save."""
        ls = self.lines
        ls.extend(text.split('\n'))
        self.lines = ls
        self.save()

    def find_lines(self, query: str) -> List[tuple]:
        """Find lines containing query. Returns [(line_number, line_text), ...]."""
        q = query.lower()
        return [(i + 1, line) for i, line in enumerate(self.lines) if q in line.lower()]

    def save(self):
        """Save this memo back to ~/.flake/data.json."""
        flake = Flake()
        data = flake._read()
        for i, m in enumerate(data):
            if m['id'] == self.id:
                self.updatedAt = datetime.now().isoformat()
                data[i] = asdict(self)
                break
        flake._write(data)

    def to_dict(self) -> dict:
        return asdict(self)

    def __repr__(self):
        title = self.title or '(untitled)'
        return f'Memo(id={self.id!r}, title={title!r})'


class Flake:
    """Interface to read and write Flake memos stored in ~/.flake/data.json."""

    def __init__(self, data_path: Optional[str] = None):
        self.data_path = data_path or DATA_PATH
        os.makedirs(os.path.dirname(self.data_path), exist_ok=True)

    def _read(self) -> List[dict]:
        if not os.path.exists(self.data_path):
            return []
        with open(self.data_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def _write(self, data: List[dict]):
        with open(self.data_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def _to_memo(self, d: dict) -> Memo:
        return Memo(
            id=d.get('id', ''),
            title=d.get('title', ''),
            content=d.get('content', ''),
            createdAt=d.get('createdAt', ''),
            updatedAt=d.get('updatedAt', ''),
            images=d.get('images', []),
        )

    def list(self) -> List[Memo]:
        """List all memos."""
        return [self._to_memo(d) for d in self._read()]

    def get(self, id: Optional[str] = None, title: Optional[str] = None) -> Optional[Memo]:
        """Get a memo by id or title. Returns None if not found."""
        for d in self._read():
            if id and d.get('id') == id:
                return self._to_memo(d)
            if title and d.get('title') == title:
                return self._to_memo(d)
        return None

    def create(self, title: str = '', content: str = '') -> Memo:
        """Create a new memo and save it."""
        now = datetime.now().isoformat()
        memo = Memo(
            id=_generate_id(),
            title=title,
            content=content.replace('\n', '<br>') if '\n' in content else content,
            createdAt=now,
            updatedAt=now,
        )
        data = self._read()
        data.insert(0, asdict(memo))
        self._write(data)
        return memo

    def update(self, id: str, title: Optional[str] = None, content: Optional[str] = None) -> Optional[Memo]:
        """Update an existing memo by id."""
        data = self._read()
        for i, d in enumerate(data):
            if d['id'] == id:
                if title is not None:
                    d['title'] = title
                if content is not None:
                    d['content'] = content.replace('\n', '<br>') if '\n' in content else content
                d['updatedAt'] = datetime.now().isoformat()
                self._write(data)
                return self._to_memo(d)
        return None

    def delete(self, id: str) -> bool:
        """Delete a memo by id. Returns True if deleted."""
        data = self._read()
        new_data = [d for d in data if d['id'] != id]
        if len(new_data) < len(data):
            self._write(new_data)
            return True
        return False

    def search(self, query: str) -> List[Memo]:
        """Search memos by title or content (case-insensitive)."""
        q = query.lower()
        results = []
        for d in self._read():
            if q in d.get('title', '').lower() or q in _strip_html(d.get('content', '')).lower():
                results.append(self._to_memo(d))
        return results

    def clear(self):
        """Delete all memos."""
        self._write([])
