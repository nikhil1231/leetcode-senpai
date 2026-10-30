"""Meeting-room bookings for the office app.

Times are whole minutes from the start of the calendar. A booking holds the half-open range
[start, end), so a 540-600 meeting and a 600-660 meeting do not clash.
Each room keeps its bookings sorted by start; since they never overlap, the ends are sorted
too, so a clash can only be with the neighbours of the insertion point.
"""
from bisect import bisect_left
from dataclasses import dataclass


class Clash(Exception):
    pass


@dataclass(frozen=True)
class Booking:
    room: str
    start: int
    end: int
    who: str


class Calendar:
    def __init__(self, rooms):
        self.rooms = dict(rooms)  # name -> capacity
        self.bookings = {name: [] for name in self.rooms}  # sorted by start
        self.starts = {name: [] for name in self.rooms}

    def _clash(self, room, start, end):
        """The booking that overlaps [start, end), if any, and the insertion index."""
        i = bisect_left(self.starts[room], start)
        items = self.bookings[room]
        if i > 0 and overlaps(start, end, items[i - 1].start, items[i - 1].end):
            return items[i - 1], i
        if i < len(items) and overlaps(start, end, items[i].start, items[i].end):
            return items[i], i
        return None, i

    def book(self, room, start, end, who):
        if room not in self.rooms:
            raise KeyError(room)
        if not 0 <= start < end:
            raise ValueError('bad time range')
        clash, i = self._clash(room, start, end)
        if clash:
            raise Clash(f'{room} is taken {clash.start}-{clash.end} by {clash.who}')
        booking = Booking(room, start, end, who)
        self.bookings[room].insert(i, booking)
        self.starts[room].insert(i, start)
        return booking

    def is_free(self, room, start, end):
        return self._clash(room, start, end)[0] is None

    def free_slots(self, room, day_start, day_end, length):
        """Gaps of at least `length` minutes inside [day_start, day_end), as (start, end) pairs."""
        slots, cursor = [], day_start
        for b in self.bookings[room]:
            if b.start >= day_end:
                break
            if min(b.start, day_end) - cursor >= length:
                slots.append((cursor, b.start))
            cursor = max(cursor, b.end)
        if day_end - cursor >= length:
            slots.append((cursor, day_end))
        return slots

    def find_room(self, start, end, people):
        """The smallest free room that seats `people`; ties go to the first name alphabetically."""
        fits = sorted((cap, name) for name, cap in self.rooms.items() if cap >= people)
        return next((name for _, name in fits if self.is_free(name, start, end)), None)


def overlaps(a_start, a_end, b_start, b_end):
    return a_start < b_end and b_start < a_end
