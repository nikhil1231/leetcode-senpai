import java.security.AccessController;
import java.security.PrivilegedAction;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.locks.LockSupport;
import java.util.function.IntConsumer;

/**
 * Helpers for concurrency tests (trusted: it can read other threads' stacks for a timeout report).
 * runAll / parallel start workers together and fail with a thread dump if they do not finish in time; jitter perturbs
 * scheduling so races show up; Gauge counts how many threads are inside a section at once; metric records a number
 * for the review.
 */
public final class Conc {
    private Conc() {}

    private static final Map<String, Long> METRICS = new ConcurrentHashMap<>();

    /** A small random pause (nothing, a yield, a spin or a few microseconds parked), to shake out races. */
    public static void jitter() {
        ThreadLocalRandom r = ThreadLocalRandom.current();
        switch (r.nextInt(4)) {
            case 0 -> { }
            case 1 -> Thread.yield();
            case 2 -> { for (int i = r.nextInt(200); i > 0; i--) Thread.onSpinWait(); }
            default -> LockSupport.parkNanos(r.nextInt(1, 50_000));
        }
    }

    /** Runs each task on its own thread, all released at once; waits up to timeoutMs for every one. */
    public static void runAll(long timeoutMs, Runnable... tasks) {
        List<Thread> threads = new ArrayList<>();
        CountDownLatch go = new CountDownLatch(1);
        AtomicReference<Throwable> failure = new AtomicReference<>();
        for (int i = 0; i < tasks.length; i++) {
            Runnable task = tasks[i];
            Thread t = new Thread(() -> {
                try { go.await(); task.run(); }
                catch (Throwable e) { failure.compareAndSet(null, e); }
            }, "worker-" + i);
            t.setDaemon(true);
            threads.add(t);
            t.start();
        }
        go.countDown();
        long end = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        List<Thread> stuck = new ArrayList<>();
        for (Thread t : threads) {
            long left = end - System.nanoTime();
            try { if (left > 0) t.join(Math.max(1, left / 1_000_000)); }
            catch (InterruptedException e) { Thread.currentThread().interrupt(); break; }
            if (t.isAlive()) stuck.add(t);
        }
        if (!stuck.isEmpty()) {
            throw new AssertionError(stuck.size() + " of " + threads.size() + " threads had not finished after " + timeoutMs
                    + " ms (a deadlock, a missed wake-up, or a thread that never returns).\n" + dump(stuck));
        }
        Throwable f = failure.get();
        if (f instanceof Error e) throw e;
        if (f instanceof RuntimeException e) throw e;
        if (f != null) throw new RuntimeException(f);
    }

    /** Runs task(0) .. task(n-1), each on its own thread, as runAll does. */
    public static void parallel(int n, long timeoutMs, IntConsumer task) {
        Runnable[] tasks = new Runnable[n];
        for (int i = 0; i < n; i++) { int k = i; tasks[i] = () -> task.accept(k); }
        runAll(timeoutMs, tasks);
    }

    /** Counts threads inside a section: call enter() on the way in and exit() on the way out; max() is the peak. */
    public static final class Gauge {
        private final AtomicInteger now = new AtomicInteger(), peak = new AtomicInteger();
        public void enter() { int n = now.incrementAndGet(); peak.accumulateAndGet(n, Math::max); }
        public void exit() { now.decrementAndGet(); }
        public int current() { return now.get(); }
        public int max() { return peak.get(); }
    }

    /** Records a number about this test (the largest value per name is kept), shown to the reviewer. */
    public static void metric(String name, long value) { METRICS.merge(name, value, Math::max); }

    static Map<String, Long> metrics() { return new TreeMap<>(METRICS); }

    static void resetMetrics() { METRICS.clear(); }

    /** Stacks of threads started since `before`, as text. */
    static String dumpNew(Set<Thread> before) {
        List<Thread> fresh = new ArrayList<>();
        for (Thread t : Thread.getAllStackTraces().keySet()) if (!before.contains(t) && t.isAlive()) fresh.add(t);
        return dump(fresh);
    }

    @SuppressWarnings("removal")
    static String dump(List<Thread> threads) {
        return AccessController.doPrivileged((PrivilegedAction<String>) () -> {
            StringBuilder sb = new StringBuilder();
            int shown = 0;
            for (Thread t : threads) {
                if (shown++ == 10) { sb.append("... and ").append(threads.size() - 10).append(" more\n"); break; }
                sb.append('"').append(t.getName()).append("\" ").append(t.getState()).append('\n');
                int frames = 0;
                for (StackTraceElement e : t.getStackTrace()) {
                    String c = e.getClassName();
                    if (c.startsWith("ConcurrencyTestRunner") || c.startsWith("jdk.internal.") || c.startsWith("java.lang.reflect")) continue;
                    sb.append("    at ").append(e).append('\n');
                    if (++frames == 6) break;
                }
            }
            return sb.toString();
        });
    }
}
