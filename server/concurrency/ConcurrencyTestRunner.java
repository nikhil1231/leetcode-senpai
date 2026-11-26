import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.io.PrintStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Trusted adapter for concurrency suites. Each public static void test*() method runs `repeats` times, every run on a
 * fresh daemon thread with its own timeout, so a deadlock fails that test (with a thread dump) and the suite carries on.
 * Per test it reports runs completed, wall and process CPU time, what the code printed and any Conc.metric values.
 * Args: nonce repeats timeoutMs budgetMs class...
 */
public final class ConcurrencyTestRunner {
    private static String enc(String text) {
        return Base64.getEncoder().encodeToString((text == null ? "" : text).getBytes(StandardCharsets.UTF_8));
    }

    /** Keeps the first `limit` bytes a test prints; the rest is dropped, so a printing loop costs nothing. */
    private static final class Bounded extends OutputStream {
        private final ByteArrayOutputStream buf = new ByteArrayOutputStream();
        private final int limit;
        Bounded(int limit) { this.limit = limit; }
        @Override public synchronized void write(int b) { if (buf.size() < limit) buf.write(b); }
        @Override public synchronized void write(byte[] b, int off, int len) {
            int room = Math.max(0, limit - buf.size());
            buf.write(b, off, Math.min(room, len));
        }
        synchronized String text() { return buf.toString(StandardCharsets.UTF_8); }
    }

    public static void main(String[] args) throws Exception {
        if (System.getSecurityManager() == null) throw new IllegalStateException("Sandbox policy is required");
        String nonce = args[0];
        int repeats = Math.max(1, Integer.parseInt(args[1]));
        long timeoutMs = Long.parseLong(args[2]);
        long deadline = System.nanoTime() + Long.parseLong(args[3]) * 1_000_000L;
        PrintStream out = System.out;
        com.sun.management.OperatingSystemMXBean os =
                (com.sun.management.OperatingSystemMXBean) java.lang.management.ManagementFactory.getOperatingSystemMXBean();
        int count = 0;
        for (int i = 4; i < args.length; i++) {
            Class<?> suite = Class.forName(args[i]);
            Method[] methods = suite.getMethods();
            Arrays.sort(methods, java.util.Comparator.comparing(Method::getName));
            for (Method method : methods) {
                if (!method.getName().startsWith("test") || method.getParameterCount() != 0
                        || !Modifier.isStatic(method.getModifiers()) || method.getReturnType() != void.class) continue;
                String status = "passed", message = "";
                int done = 0;
                long wall = 0, cpu = 0;
                Bounded printed = new Bounded(4000);
                PrintStream capture = new PrintStream(printed, true, StandardCharsets.UTF_8);
                Conc.resetMetrics();
                System.setOut(capture);
                System.setErr(capture);
                try {
                    for (int run = 0; run < repeats; run++) {
                        if (System.nanoTime() > deadline) {
                            if (done == 0) { status = "error"; message = "Not run: the suite ran out of time"; }
                            break;
                        }
                        Set<Thread> before = new HashSet<>(Thread.getAllStackTraces().keySet());
                        Throwable[] failure = new Throwable[1];
                        Thread t = new Thread(() -> {
                            try { method.invoke(null); }
                            catch (InvocationTargetException e) { failure[0] = e.getCause(); }
                            catch (Throwable e) { failure[0] = e; }
                        }, "test-" + method.getName());
                        t.setDaemon(true);
                        long c0 = os.getProcessCpuTime(), w0 = System.nanoTime();
                        t.start();
                        t.join(timeoutMs);
                        wall += System.nanoTime() - w0;
                        cpu += os.getProcessCpuTime() - c0;
                        String of = repeats > 1 ? " (run " + (run + 1) + " of " + repeats + ")" : "";
                        if (t.isAlive()) {
                            status = "timeout";
                            message = "Timed out after " + timeoutMs + " ms" + of
                                    + ": threads are still waiting, which usually means a deadlock, a missed wake-up or a thread that never finishes.\n"
                                    + Conc.dumpNew(before);
                            break;
                        }
                        done++;
                        if (failure[0] != null) {
                            Throwable f = failure[0];
                            status = f instanceof AssertionError ? "failed" : "error";
                            message = (f instanceof AssertionError && f.getMessage() != null ? f.getMessage() : f.toString()) + of;
                            break;
                        }
                    }
                } finally {
                    System.setOut(out);
                    System.setErr(out);
                }
                if (message.length() > 1800) message = message.substring(0, 1800);
                StringBuilder metrics = new StringBuilder();
                for (Map.Entry<String, Long> e : Conc.metrics().entrySet()) {
                    if (metrics.length() > 0) metrics.append(';');
                    metrics.append(e.getKey().replaceAll("[;=\\s]", "_")).append('=').append(e.getValue());
                }
                out.println(nonce + "\t" + enc(suite.getName() + "." + method.getName()) + "\t" + status + "\t" + enc(message)
                        + "\t" + done + "\t" + (wall / 1000) + "\t" + (cpu / 1000) + "\t" + enc(printed.text()) + "\t" + enc(metrics.toString()));
                count++;
            }
        }
        if (count == 0) throw new IllegalStateException("No public static void test*() methods found");
        out.println(nonce + "\tDONE");
        out.flush();
        Runtime.getRuntime().halt(0);   // threads a timed-out test left behind must not keep the JVM alive
    }
}
