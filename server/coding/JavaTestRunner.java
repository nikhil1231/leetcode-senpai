import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;

/** Trusted test adapter. Tests are independent public static void test*() methods, no dependencies. */
public final class JavaTestRunner {
    private static String encode(String text) {
        return Base64.getEncoder().encodeToString(text.getBytes(StandardCharsets.UTF_8));
    }
    public static void main(String[] args) throws Exception {
        if (System.getSecurityManager() == null) throw new IllegalStateException("Sandbox policy is required");
        String nonce = args[0];
        java.io.PrintStream out = System.out;
        int count = 0;
        for (int i = 1; i < args.length; i++) {
            Class<?> suite = Class.forName(args[i]);
            Method[] methods = suite.getMethods();
            Arrays.sort(methods, java.util.Comparator.comparing(Method::getName));
            for (Method method : methods) {
                if (!method.getName().startsWith("test") || method.getParameterCount() != 0
                        || !Modifier.isStatic(method.getModifiers()) || method.getReturnType() != void.class) continue;
                String status = "passed", message = "";
                try { method.invoke(null); }
                catch (InvocationTargetException e) {
                    Throwable cause = e.getCause();
                    status = cause instanceof AssertionError ? "failed" : "error";
                    message = cause.toString();
                    if (message.length() > 900) message = message.substring(0, 900);
                }
                out.println(nonce + "\t" + encode(suite.getName() + "." + method.getName()) + "\t" + status + "\t" + encode(message));
                count++;
            }
        }
        if (count == 0) throw new IllegalStateException("No public static void test*() methods found");
        out.println(nonce + "\tDONE");
    }
}
