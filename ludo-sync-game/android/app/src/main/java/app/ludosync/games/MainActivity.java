package app.ludosync.games;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NearbyPlayersPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
