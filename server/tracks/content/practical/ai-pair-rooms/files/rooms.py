"""Meeting-room bookings for the office app.

Times are whole minutes from the start of the calendar. A booking holds the half-open range
[start, end), so a 540-600 meeting and a 600-660 meeting do not clash.
"""
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
        self.bookings = {name: [] for name in self.rooms}

    def book(self, room, start, end, who):
        if room not in self.rooms:
            raise KeyError(room)
        if not 0 <= start < end:
            raise ValueError('bad time range')
        for b in self.bookings[room]:
            if overlaps(start, end, b.start, b.end):
                raise Clash(f'{room} is taken {b.start}-{b.end} by {b.who}')
        booking = Booking(room, start, end, who)
        self.bookings[room].append(booking)
        return booking

    def is_free(self, room, start, end):
        return not any(overlaps(start, end, b.start, b.end) for b in self.bookings[room])

    def free_slots(self, room, day_start, day_end, length):
        """Gaps of at least `length` minutes inside [day_start, day_end), as (start, end) pairs."""
        slots, cursor = [], day_start
        for b in self.bookings[room]:
            if b.start - cursor >= length:
                slots.append((cursor, b.start))
            cursor = max(cursor, b.end)
        if day_end - cursor >= length:
            slots.append((cursor, day_end))
        return slots

    def find_room(self, start, end, people):
        """Phase 2: see the brief."""
        raise NotImplementedError


def overlaps(a_start, a_end, b_start, b_end):
    return a_start <= b_end and b_start <= a_end
