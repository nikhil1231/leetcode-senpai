"""Local launcher: reserve the first available port before starting Uvicorn.

Hunting for a free port is right for a dev run started by hand — the terminal
says which port it landed on. It is wrong for a service behind a tunnel, where
the ingress rule names one port and a server that quietly moved is a 502 with
no obvious cause; those runs pass strict=True and get a hard failure instead.
"""
import errno
import logging
import socket

import uvicorn
from uvicorn.supervisors import ChangeReload


def bind_available(host, port, strict=False):
    if not 0 <= port <= 65535:
        raise ValueError("PORT must be between 0 and 65535")
    family = socket.AF_INET6 if ":" in host else socket.AF_INET
    last = port if strict else 65535
    for candidate in range(port, last + 1):
        sock = socket.socket(family, socket.SOCK_STREAM)
        try:
            # Windows' SO_REUSEADDR can allow two servers on the same port.
            option = getattr(socket, "SO_EXCLUSIVEADDRUSE", socket.SO_REUSEADDR)
            sock.setsockopt(socket.SOL_SOCKET, option, 1)
            sock.bind((host, candidate))
            sock.set_inheritable(True)
            return sock
        except OSError as exc:
            sock.close()
            if exc.errno != errno.EADDRINUSE or candidate == last:
                raise
    raise RuntimeError("No available port")


def run_local(host="127.0.0.1", port=8000, reload=True, strict=False):
    config = uvicorn.Config("server.main:app", host=host, port=port, reload=reload)
    with bind_available(host, port, strict=strict) as sock:
        config.port = sock.getsockname()[1]
        display_host = f"[{host}]" if ":" in host else host
        logger = logging.getLogger("uvicorn.error")
        if port and config.port != port:
            logger.info("Port %s is busy; using %s instead.", port, config.port)
        logger.info("Open http://%s:%s", display_host, config.port)
        server = uvicorn.Server(config)
        try:
            if config.should_reload:
                ChangeReload(config, target=server.run, sockets=[sock]).run()
            else:
                server.run(sockets=[sock])
        except KeyboardInterrupt:
            pass
        if not config.should_reload and not server.started:
            raise SystemExit(3)
