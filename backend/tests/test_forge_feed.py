"""forge_feed.py, the serve side of the forge's site feed (forge plan 41 M3).
Runs under pytest or as a script:
    venv/bin/python tests/test_forge_feed.py
"""
import datetime as dt
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import forge_feed

NOW = dt.datetime(2026, 11, 16, 12, 0, tzinfo=dt.timezone.utc)


def _with_file(snap):
    def deco(fn):
        def run():
            with tempfile.TemporaryDirectory() as tmp:
                old = forge_feed._PATH
                forge_feed._PATH = os.path.join(tmp, "feed.json")
                forge_feed._CACHE.update(mtime=None, data=None)
                if snap is not None:
                    with open(forge_feed._PATH, "w") as f:
                        f.write(snap if isinstance(snap, str) else json.dumps(snap))
                try:
                    fn()
                finally:
                    forge_feed._PATH = old
        run.__name__ = fn.__name__
        return run
    return deco


@_with_file({"schema": 1, "built_at": "2026-11-16T11:58:00+00:00", "days": 14,
             "items": [{"ts": "2026-11-16T11:57:00+00:00", "title": "📰 pre-open",
                        "text": "■ 📰 pre-open\n1. x", "paged": False, "source": "news-flash"}]})
def test_payload_passes_items_and_age():
    out = forge_feed.payload(NOW)
    assert out["age_s"] == 120
    assert out["days"] == 14
    assert [i["title"] for i in out["items"]] == ["📰 pre-open"]


@_with_file(None)
def test_missing_file_says_so():
    out = forge_feed.payload(NOW)
    assert out["items"] == [] and "No feed" in out["message"]


@_with_file('{"torn')
def test_corrupt_file_is_absent():
    assert forge_feed.payload(NOW)["items"] == []


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
