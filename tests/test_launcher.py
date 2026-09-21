import errno
import socket

import pytest

from server.launcher import bind_available


def test_busy_port_uses_next_available_and_keeps_it_reserved():
    with socket.socket() as busy:
        busy.bind(("127.0.0.1", 0))
        busy.listen()
        port = busy.getsockname()[1]
        if port == 65535:
            pytest.skip("No higher port available")
        with bind_available("127.0.0.1", port) as selected:
            actual = selected.getsockname()[1]
            assert actual > port
            selected.listen()
            with socket.socket() as other:
                with pytest.raises(OSError) as error:
                    other.bind(("127.0.0.1", actual))
                assert error.value.errno == errno.EADDRINUSE


def test_zero_requests_an_available_port():
    with bind_available("127.0.0.1", 0) as selected:
        assert selected.getsockname()[1] > 0


def test_bind_errors_other_than_busy_are_not_retried(monkeypatch):
    class DeniedSocket:
        closed = False
        def setsockopt(self, *args):
            pass
        def bind(self, address):
            raise PermissionError(errno.EACCES, "denied")
        def close(self):
            self.closed = True
    sock = DeniedSocket()
    monkeypatch.setattr(socket, "socket", lambda *args: sock)
    with pytest.raises(PermissionError):
        bind_available("127.0.0.1", 8000)
    assert sock.closed


@pytest.mark.parametrize("port", [-1, 65536])
def test_invalid_port_is_rejected(port):
    with pytest.raises(ValueError):
        bind_available("127.0.0.1", port)


def test_strict_refuses_a_busy_port_instead_of_moving():
    """A tunnel's ingress rule names one port. Landing on a different one would
    be a 502 whose cause is invisible from the outside, so strict runs fail."""
    with socket.socket() as busy:
        busy.bind(("127.0.0.1", 0))
        busy.listen()
        port = busy.getsockname()[1]
        with pytest.raises(OSError) as error:
            bind_available("127.0.0.1", port, strict=True)
        assert error.value.errno == errno.EADDRINUSE


def test_strict_still_binds_a_free_port():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    with bind_available("127.0.0.1", port, strict=True) as selected:
        assert selected.getsockname()[1] == port
