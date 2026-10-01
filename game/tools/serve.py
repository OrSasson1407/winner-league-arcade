"""Local web server for Winner League Arcade.

Like `python -m http.server`, plus:
  * no browser caching, so game updates show up on a normal refresh;
  * gzip compression for text files. The 1.8 MB data file goes over the wire as ~0.3 MB,
    which also avoids the stalled/truncated large responses seen on some Windows setups.
Serves the israel-bsl-database folder.
    python game/tools/serve.py [port]
"""
import gzip
import http.server
import mimetypes
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]  # israel-bsl-database/
TEXT_TYPES = {".html", ".js", ".mjs", ".css", ".json", ".svg", ".txt", ".webmanifest"}
mimetypes.add_type("application/manifest+json", ".webmanifest")
_gz_cache = {}  # path -> (mtime, compressed bytes)


class Handler(http.server.SimpleHTTPRequestHandler):
    # HTTP/1.1 keep-alive: the client reads exactly Content-Length bytes before the socket is
    # closed. With the default HTTP/1.0 the server closes right after writing, and on Windows
    # that can cut off the tail of a response (stalled, truncated loads).
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def do_GET(self):
        path = Path(self.translate_path(unquote(urlsplit(self.path).path)))
        if path.is_dir():
            path = path / "index.html"
        wants_gzip = "gzip" in self.headers.get("Accept-Encoding", "")
        if not (wants_gzip and path.is_file() and path.suffix in TEXT_TYPES):
            return super().do_GET()
        mtime = path.stat().st_mtime
        cached = _gz_cache.get(path)
        if not cached or cached[0] != mtime:
            cached = (mtime, gzip.compress(path.read_bytes(), compresslevel=6))
            _gz_cache[path] = cached
        body = cached[1]
        ctype = "text/javascript" if path.suffix in (".js", ".mjs") else (mimetypes.guess_type(path.name)[0] or "text/plain")
        self.send_response(200)
        self.send_header("Content-Type", f"{ctype}; charset=utf-8")
        self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):  # quieter console
        if not str(args[1]).startswith(("2", "3")):
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler) as httpd:
        print(f"Winner League Arcade: http://localhost:{port}/game/  (close this window to stop)")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
