"""A hand-written concurrency question (a bounded blocking buffer) for the runner and validation tests."""

STARTER = '''import java.util.*;

public class BoundedBuffer {
    public BoundedBuffer(int capacity) {
    }

    public void put(int value) throws InterruptedException {
    }

    public int take() throws InterruptedException {
        return 0;
    }

    public int size() {
        return 0;
    }
}
'''

SOLUTION = '''import java.util.*;
import java.util.concurrent.locks.*;

public class BoundedBuffer {
    private final ArrayDeque<Integer> items = new ArrayDeque<>();
    private final int capacity;
    private final ReentrantLock lock = new ReentrantLock();
    private final Condition notFull = lock.newCondition(), notEmpty = lock.newCondition();

    public BoundedBuffer(int capacity) { this.capacity = capacity; }

    public void put(int value) throws InterruptedException {
        lock.lock();
        try {
            while (items.size() == capacity) notFull.await();
            items.addLast(value);
            notEmpty.signal();
        } finally { lock.unlock(); }
    }

    public int take() throws InterruptedException {
        lock.lock();
        try {
            while (items.isEmpty()) notEmpty.await();
            int v = items.removeFirst();
            notFull.signal();
            return v;
        } finally { lock.unlock(); }
    }

    public int size() {
        lock.lock();
        try { return items.size(); } finally { lock.unlock(); }
    }
}
'''

# No synchronisation at all: lost items and corrupted state under contention.
UNSYNCHRONISED = '''import java.util.*;

public class BoundedBuffer {
    private final ArrayDeque<Integer> items = new ArrayDeque<>();
    private final int capacity;
    public BoundedBuffer(int capacity) { this.capacity = capacity; }
    public void put(int value) throws InterruptedException {
        while (items.size() >= capacity) Thread.onSpinWait();
        items.addLast(value);
    }
    public int take() throws InterruptedException {
        while (items.isEmpty()) Thread.onSpinWait();
        return items.removeFirst();
    }
    public int size() { return items.size(); }
}
'''

# Never wakes a waiting producer: deadlocks as soon as the buffer fills.
NO_SIGNAL = SOLUTION.replace('            notFull.signal();\n', '')

VISIBLE = '''public class VisibleTest {
    public static void testFifoOrder() throws Exception {
        BoundedBuffer b = new BoundedBuffer(3);
        b.put(1); b.put(2); b.put(3);
        assert b.take() == 1 && b.take() == 2 && b.take() == 3 : "items should come out in the order they went in";
    }

    public static void testTakeWaitsForPut() throws Exception {
        BoundedBuffer b = new BoundedBuffer(1);
        int[] got = new int[1];
        Conc.runAll(2000, () -> { try { got[0] = b.take(); } catch (InterruptedException e) { throw new RuntimeException(e); } },
                          () -> { try { Thread.sleep(20); b.put(7); } catch (InterruptedException e) { throw new RuntimeException(e); } });
        assert got[0] == 7 : "take() should wait for the put and return 7, got " + got[0];
    }
}
'''

HIDDEN = '''import java.util.concurrent.atomic.*;

public class HiddenTest {
    public static void testManyProducersAndConsumersLoseNothing() throws Exception {
        BoundedBuffer b = new BoundedBuffer(4);
        AtomicLong sum = new AtomicLong();
        Conc.parallel(8, 3000, i -> {
            try {
                for (int k = 0; k < 200; k++) {
                    if (i % 2 == 0) { b.put(1); Conc.jitter(); } else { sum.addAndGet(b.take()); }
                }
            } catch (InterruptedException e) { throw new RuntimeException(e); }
        });
        assert sum.get() == 800 : "consumers should receive all 800 items, got " + sum.get();
        assert b.size() == 0 : "the buffer should be empty, size is " + b.size();
    }

    public static void testPutBlocksWhenFull() throws Exception {
        BoundedBuffer b = new BoundedBuffer(2);
        b.put(1); b.put(2);
        Thread t = new Thread(() -> { try { b.put(3); } catch (InterruptedException e) { } });
        t.setDaemon(true);
        t.start();
        Thread.sleep(30);
        assert t.isAlive() && b.size() == 2 : "put() on a full buffer should wait";
        assert b.take() == 1;
        t.join(1000);
        assert !t.isAlive() && b.size() == 2 : "the waiting put() should finish once there is room";
    }
}
'''


def question(**over):
    return {'class_name': 'BoundedBuffer', 'starter': STARTER, 'solution': SOLUTION, 'visible_tests': VISIBLE,
            'hidden_tests': HIDDEN, 'timeout_ms': 2000, 'level': 3,
            'broken': [{'n': 1, 'kind': 'no-synchronisation', 'description': 'no locking', 'weaker_tool': True, 'code': UNSYNCHRONISED},
                       {'n': 2, 'kind': 'missed-wakeup', 'description': 'never signals notFull', 'weaker_tool': False, 'code': NO_SIGNAL}],
            **over}
