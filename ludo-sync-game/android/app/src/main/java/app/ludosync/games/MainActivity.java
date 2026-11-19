package app.ludosync.games;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            try {
                java.io.StringWriter w = new java.io.StringWriter();
                e.printStackTrace(new java.io.PrintWriter(w));
                getSharedPreferences("crash", MODE_PRIVATE).edit().putString("trace", "Thread " + t.getName() + "\n" + w).commit();
            } catch (Throwable ignored) {}
            if (previous != null) previous.uncaughtException(t, e);
        });
        registerPlugin(NearbyPlayersPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
