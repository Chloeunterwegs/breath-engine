#!/usr/bin/env python3
"""T9 预检：仓库根 HTTPS 服务（真机麦克风需要安全上下文，局域网 http 不够）。

用法：
  python3 serve-https.py <仓库目录> <cert.pem> <key.pem> [端口，默认 8443]

标准库实现，零安装。iPhone/Android 浏览器访问 https://<电脑IP>:8443。
"""
import http.server
import ssl
import sys
from pathlib import Path

def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)
    root, cert, key = Path(sys.argv[1]).resolve(), sys.argv[2], sys.argv[3]
    port = int(sys.argv[4]) if len(sys.argv) > 4 else 8443

    handler = http.server.SimpleHTTPRequestHandler

    class H(handler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(root), **kw)

    class TLS(http.server.ThreadingHTTPServer):
        def __init__(self):
            super().__init__(("0.0.0.0", port), H)

    httpd = TLS()
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(cert, key)
    httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
    ips = __import__("subprocess").run(
        ["ipconfig", "getifaddr", "en0"], capture_output=True, text=True
    ).stdout.strip() or "<电脑IP>"
    print(f"服务已起：https://{ips}:{port}  （仓库根 = {root}）  Ctrl+C 停")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()
