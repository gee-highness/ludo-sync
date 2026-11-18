package app.ludosync.games;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.nearby.Nearby;
import com.google.android.gms.nearby.connection.AdvertisingOptions;
import com.google.android.gms.nearby.connection.ConnectionInfo;
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback;
import com.google.android.gms.nearby.connection.ConnectionResolution;
import com.google.android.gms.nearby.connection.ConnectionsClient;
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo;
import com.google.android.gms.nearby.connection.DiscoveryOptions;
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback;
import com.google.android.gms.nearby.connection.Payload;
import com.google.android.gms.nearby.connection.PayloadCallback;
import com.google.android.gms.nearby.connection.PayloadTransferUpdate;
import com.google.android.gms.nearby.connection.Strategy;

import org.json.JSONObject;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Finds other phones with the app open, and connects to them, with no internet. Two ways at once:
 * Google Nearby Connections (Bluetooth and Wi-Fi Direct, no shared network needed) and a beacon on the local
 * Wi-Fi or hotspot (for phones without Google Play services). The page sees one list and one kind of connection.
 *
 * Events: found {rid, via, device, name, code}, lost {rid}, invited {cid, via, info}, closed {cid}, message {cid, data}.
 * Peer ids (rid) are "g:<endpoint>" or "l:<device>"; connection ids (cid) are "g:<endpoint>" or "l<n>".
 */
@CapacitorPlugin(
    name = "NearbyPlayers",
    permissions = {
        @Permission(alias = "nearby13", strings = { "android.permission.BLUETOOTH_SCAN", "android.permission.BLUETOOTH_ADVERTISE", "android.permission.BLUETOOTH_CONNECT", "android.permission.NEARBY_WIFI_DEVICES" }),
        @Permission(alias = "nearby12", strings = { "android.permission.BLUETOOTH_SCAN", "android.permission.BLUETOOTH_ADVERTISE", "android.permission.BLUETOOTH_CONNECT", "android.permission.ACCESS_FINE_LOCATION" }),
        @Permission(alias = "nearbyOld", strings = { "android.permission.ACCESS_FINE_LOCATION" })
    }
)
public class NearbyPlayersPlugin extends Plugin {
    private static final String SERVICE_ID = "app.ludosync.games.nearby";
    private static final int LAN_PORT = 47812;
    private static final int MAX_FRAME = 1 << 20;
    private static final long LOST_MS = 7000;

    private String me = "{}";
    private String device = "";
    private boolean visible = false;

    // ---- Google Nearby ------------------------------------------------------------------------
    private ConnectionsClient google;
    private boolean googleOn = false;
    private final Map<String, PluginCall> outgoing = new ConcurrentHashMap<>();
    private final Map<String, PluginCall> accepting = new ConcurrentHashMap<>();

    // ---- local network ------------------------------------------------------------------------
    private final ExecutorService io = Executors.newCachedThreadPool();
    private ScheduledExecutorService beat;
    private DatagramSocket udp;
    private ServerSocket server;
    private WifiManager.MulticastLock lock;
    private final AtomicInteger seq = new AtomicInteger();
    private final Map<String, LanPeer> lanPeers = new ConcurrentHashMap<>();
    private final Map<String, LanConn> lanConns = new ConcurrentHashMap<>();

    private static class LanPeer { InetAddress addr; int port; long seen; }
    private static class LanConn {
        final Socket socket; final DataInputStream in; final DataOutputStream out; volatile boolean open = true;
        /** One writer per connection, so messages leave in the order they were sent. */
        final ExecutorService writer = Executors.newSingleThreadExecutor();
        LanConn(Socket s) throws IOException { socket = s; in = new DataInputStream(s.getInputStream()); out = new DataOutputStream(s.getOutputStream()); }
        synchronized void write(byte[] b) throws IOException { out.writeInt(b.length); out.write(b); out.flush(); }
        byte[] read() throws IOException { int n = in.readInt(); if (n < 0 || n > MAX_FRAME) throw new IOException("frame"); byte[] b = new byte[n]; in.readFully(b); return b; }
        void close() { open = false; writer.shutdown(); try { socket.close(); } catch (IOException ignored) {} }
    }

    // ---- permissions and status ---------------------------------------------------------------
    private String alias() {
        if (Build.VERSION.SDK_INT >= 33) return "nearby13";
        if (Build.VERSION.SDK_INT >= 31) return "nearby12";
        return "nearbyOld";
    }
    private boolean granted() { return getPermissionState(alias()) == PermissionState.GRANTED; }
    private boolean googleAvailable() {
        try { return GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(getContext()) == ConnectionResult.SUCCESS; }
        catch (Throwable t) { return false; }
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", granted());
        r.put("google", googleAvailable());
        r.put("visible", visible);
        call.resolve(r);
    }

    /** Asks for the Bluetooth / nearby devices permission the first time it is needed. */
    @PluginMethod
    public void access(PluginCall call) {
        if (granted()) { JSObject r = new JSObject(); r.put("granted", true); call.resolve(r); return; }
        requestPermissionForAlias(alias(), call, "accessDone");
    }

    @PermissionCallback
    private void accessDone(PluginCall call) {
        boolean ok = granted();
        if (ok && visible) startGoogle();
        JSObject r = new JSObject(); r.put("granted", ok); call.resolve(r);
    }

    // ---- being visible and looking for others -------------------------------------------------
    @PluginMethod
    public void start(PluginCall call) {
        device = call.getString("device", "");
        JSObject info = new JSObject();
        info.put("d", device);
        info.put("n", call.getString("name", "Player"));
        info.put("c", call.getString("code", ""));
        me = info.toString();
        visible = true;
        startLan();
        if (granted()) startGoogle();
        JSObject r = new JSObject(); r.put("google", googleOn); call.resolve(r);
    }

    /** Stops being visible and looking (the app went to the background). Open connections stay up. */
    @PluginMethod
    public void stop(PluginCall call) {
        visible = false;
        stopGoogleDiscovery();
        if (beat != null) { beat.shutdownNow(); beat = null; }
        for (String d : lanPeers.keySet()) lost("l:" + d);
        lanPeers.clear();
        call.resolve();
    }

    private void startGoogle() {
        if (googleOn || !googleAvailable()) return;
        try {
            google = Nearby.getConnectionsClient(getContext());
            Strategy s = Strategy.P2P_CLUSTER;
            google.startAdvertising(me, SERVICE_ID, lifecycle, new AdvertisingOptions.Builder().setStrategy(s).build());
            google.startDiscovery(SERVICE_ID, discovery, new DiscoveryOptions.Builder().setStrategy(s).build());
            googleOn = true;
        } catch (Throwable t) { googleOn = false; }
    }

    private void stopGoogleDiscovery() {
        if (google != null && googleOn) { try { google.stopAdvertising(); google.stopDiscovery(); } catch (Throwable ignored) {} }
        googleOn = false;
    }

    private final EndpointDiscoveryCallback discovery = new EndpointDiscoveryCallback() {
        @Override public void onEndpointFound(String id, DiscoveredEndpointInfo info) {
            try {
                JSONObject j = new JSONObject(info.getEndpointName());
                if (device.equals(j.optString("d"))) return;
                found("g:" + id, "google", j.optString("d"), j.optString("n"), j.optString("c"));
            } catch (Exception ignored) {}
        }
        @Override public void onEndpointLost(String id) { lost("g:" + id); }
    };

    private final ConnectionLifecycleCallback lifecycle = new ConnectionLifecycleCallback() {
        @Override public void onConnectionInitiated(String id, ConnectionInfo info) {
            if (outgoing.containsKey(id)) { google.acceptConnection(id, payloads); return; } // our own invite
            JSObject e = new JSObject();
            e.put("cid", "g:" + id); e.put("via", "google"); e.put("info", info.getEndpointName());
            notifyListeners("invited", e);
        }
        @Override public void onConnectionResult(String id, ConnectionResolution result) {
            boolean ok = result.getStatus().isSuccess();
            PluginCall out = outgoing.remove(id);
            if (out != null) { if (ok) { JSObject r = new JSObject(); r.put("cid", "g:" + id); out.resolve(r); } else out.reject("declined"); }
            PluginCall acc = accepting.remove(id);
            if (acc != null) { if (ok) acc.resolve(); else acc.reject("failed"); }
        }
        @Override public void onDisconnected(String id) { closed("g:" + id); }
    };

    private final PayloadCallback payloads = new PayloadCallback() {
        @Override public void onPayloadReceived(String id, Payload p) {
            if (p.getType() == Payload.Type.BYTES && p.asBytes() != null) message("g:" + id, p.asBytes());
        }
        @Override public void onPayloadTransferUpdate(String id, PayloadTransferUpdate u) {}
    };

    // ---- local network: beacons and sockets ---------------------------------------------------
    private synchronized void startLan() {
        try {
            if (server == null) {
                server = new ServerSocket(0);
                io.execute(this::acceptLoop);
            }
            if (udp == null) {
                WifiManager wifi = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if (wifi != null) { lock = wifi.createMulticastLock("ludosync-nearby"); lock.setReferenceCounted(false); lock.acquire(); }
                udp = new DatagramSocket(null);
                udp.setReuseAddress(true);
                udp.setBroadcast(true);
                udp.bind(new InetSocketAddress(LAN_PORT));
                io.execute(this::beaconLoop);
            }
            if (beat == null) {
                beat = Executors.newSingleThreadScheduledExecutor();
                beat.scheduleAtFixedRate(this::beacon, 0, 2, TimeUnit.SECONDS);
            }
        } catch (IOException ignored) {}
    }

    private void beacon() {
        try {
            JSONObject j = new JSONObject(me);
            j.put("a", "ludosync"); j.put("v", 1); j.put("p", server.getLocalPort());
            byte[] b = j.toString().getBytes(StandardCharsets.UTF_8);
            udp.send(new DatagramPacket(b, b.length, InetAddress.getByName("255.255.255.255"), LAN_PORT));
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    if (ia.getBroadcast() != null) udp.send(new DatagramPacket(b, b.length, ia.getBroadcast(), LAN_PORT));
                }
            }
            long now = System.currentTimeMillis();
            for (Map.Entry<String, LanPeer> e : lanPeers.entrySet()) {
                if (now - e.getValue().seen > LOST_MS) { lanPeers.remove(e.getKey()); lost("l:" + e.getKey()); }
            }
        } catch (Exception ignored) {}
    }

    private void beaconLoop() {
        byte[] buf = new byte[2048];
        while (udp != null && !udp.isClosed()) {
            try {
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                udp.receive(p);
                if (!visible) continue;
                JSONObject j = new JSONObject(new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8));
                String d = j.optString("d");
                if (!"ludosync".equals(j.optString("a")) || d.isEmpty() || d.equals(device)) continue;
                LanPeer peer = lanPeers.get(d);
                boolean fresh = peer == null;
                if (fresh) peer = new LanPeer();
                peer.addr = p.getAddress(); peer.port = j.optInt("p"); peer.seen = System.currentTimeMillis();
                lanPeers.put(d, peer);
                if (fresh) found("l:" + d, "lan", d, j.optString("n"), j.optString("c"));
            } catch (Exception ignored) {}
        }
    }

    private void acceptLoop() {
        while (server != null && !server.isClosed()) {
            try {
                Socket s = server.accept();
                io.execute(() -> {
                    try {
                        s.setSoTimeout(90_000);
                        LanConn c = new LanConn(s);
                        String info = new String(c.read(), StandardCharsets.UTF_8);
                        s.setSoTimeout(0);
                        String cid = "l" + seq.incrementAndGet();
                        lanConns.put(cid, c);
                        JSObject e = new JSObject();
                        e.put("cid", cid); e.put("via", "lan"); e.put("info", info);
                        notifyListeners("invited", e);
                    } catch (IOException ex) { try { s.close(); } catch (IOException ignored) {} }
                });
            } catch (IOException ignored) {}
        }
    }

    private void readLoop(String cid, LanConn c) {
        io.execute(() -> {
            try { while (c.open) message(cid, c.read()); }
            catch (IOException ignored) {}
            c.close(); lanConns.remove(cid); closed(cid);
        });
    }

    // ---- invitations and connections ----------------------------------------------------------
    /** Invites the player `rid`; resolves with the connection id once they accept. */
    @PluginMethod(returnType = PluginMethod.RETURN_PROMISE)
    public void invite(PluginCall call) {
        String rid = call.getString("rid", "");
        String info = call.getString("info", "{}");
        if (rid.startsWith("g:")) {
            String id = rid.substring(2);
            if (google == null) { call.reject("unavailable"); return; }
            call.setKeepAlive(true);
            outgoing.put(id, call);
            google.requestConnection(info, id, lifecycle).addOnFailureListener(e -> { if (outgoing.remove(id) != null) call.reject("unreachable"); });
            return;
        }
        if (rid.startsWith("l:")) {
            LanPeer peer = lanPeers.get(rid.substring(2));
            if (peer == null) { call.reject("gone"); return; }
            io.execute(() -> {
                try {
                    Socket s = new Socket();
                    s.connect(new InetSocketAddress(peer.addr, peer.port), 5000);
                    s.setSoTimeout(65_000); // they have a minute to answer
                    LanConn c = new LanConn(s);
                    c.write(info.getBytes(StandardCharsets.UTF_8));
                    String reply = new String(c.read(), StandardCharsets.UTF_8);
                    s.setSoTimeout(0);
                    if (!"OK".equals(reply)) { c.close(); call.reject("declined"); return; }
                    String cid = "l" + seq.incrementAndGet();
                    lanConns.put(cid, c);
                    readLoop(cid, c);
                    JSObject r = new JSObject(); r.put("cid", cid); call.resolve(r);
                } catch (IOException e) { call.reject("unreachable"); }
            });
            return;
        }
        call.reject("unknown");
    }

    @PluginMethod(returnType = PluginMethod.RETURN_PROMISE)
    public void accept(PluginCall call) {
        String cid = call.getString("cid", "");
        if (cid.startsWith("g:")) {
            String id = cid.substring(2);
            if (google == null) { call.reject("unavailable"); return; }
            call.setKeepAlive(true);
            accepting.put(id, call);
            google.acceptConnection(id, payloads).addOnFailureListener(e -> { if (accepting.remove(id) != null) call.reject("failed"); });
            return;
        }
        LanConn c = lanConns.get(cid);
        if (c == null) { call.reject("gone"); return; }
        io.execute(() -> {
            try { c.write("OK".getBytes(StandardCharsets.UTF_8)); readLoop(cid, c); call.resolve(); }
            catch (IOException e) { c.close(); lanConns.remove(cid); call.reject("failed"); }
        });
    }

    @PluginMethod
    public void decline(PluginCall call) {
        String cid = call.getString("cid", "");
        if (cid.startsWith("g:")) { if (google != null) google.rejectConnection(cid.substring(2)); }
        else {
            LanConn c = lanConns.remove(cid);
            if (c != null) io.execute(() -> { try { c.write("NO".getBytes(StandardCharsets.UTF_8)); } catch (IOException ignored) {} c.close(); });
        }
        call.resolve();
    }

    @PluginMethod
    public void send(PluginCall call) {
        String cid = call.getString("cid", "");
        byte[] data = Base64.decode(call.getString("data", ""), Base64.NO_WRAP);
        if (cid.startsWith("g:")) {
            if (google != null) google.sendPayload(cid.substring(2), Payload.fromBytes(data));
            call.resolve();
            return;
        }
        LanConn c = lanConns.get(cid);
        if (c == null) { call.reject("closed"); return; }
        try { c.writer.execute(() -> { try { c.write(data); } catch (IOException e) { c.close(); } }); } catch (Exception ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void close(PluginCall call) {
        String cid = call.getString("cid", "");
        if (cid.startsWith("g:")) { if (google != null) google.disconnectFromEndpoint(cid.substring(2)); }
        else { LanConn c = lanConns.remove(cid); if (c != null) c.close(); }
        call.resolve();
    }

    // ---- events -------------------------------------------------------------------------------
    private void found(String rid, String via, String d, String name, String code) {
        JSObject e = new JSObject();
        e.put("rid", rid); e.put("via", via); e.put("device", d); e.put("name", name); e.put("code", code);
        notifyListeners("found", e);
    }
    private void lost(String rid) { JSObject e = new JSObject(); e.put("rid", rid); notifyListeners("lost", e); }
    private void closed(String cid) { JSObject e = new JSObject(); e.put("cid", cid); notifyListeners("closed", e); }
    private void message(String cid, byte[] b) {
        JSObject e = new JSObject();
        e.put("cid", cid); e.put("data", Base64.encodeToString(b, Base64.NO_WRAP));
        notifyListeners("message", e);
    }

    @Override
    protected void handleOnDestroy() {
        stopGoogleDiscovery();
        if (google != null) { try { google.stopAllEndpoints(); } catch (Throwable ignored) {} }
        if (beat != null) beat.shutdownNow();
        if (udp != null) udp.close();
        try { if (server != null) server.close(); } catch (IOException ignored) {}
        for (LanConn c : lanConns.values()) c.close();
        if (lock != null && lock.isHeld()) lock.release();
        io.shutdownNow();
    }
}
