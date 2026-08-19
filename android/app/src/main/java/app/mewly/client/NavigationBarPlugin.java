package app.mewly.client;

import android.graphics.Color;
import android.view.Window;

import androidx.core.view.WindowCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 내비게이션 바 색·아이콘 톤을 앱 테마와 동기화하는 미니 플러그인.
 * @capacitor/status-bar는 상태바만 다루므로 하단 바는 여기서 처리한다.
 * JS 측 호출: src/native/init.js의 applyNativeTheme().
 * (Android 15+ edge-to-edge에서는 setNavigationBarColor가 no-op — JS 쪽 catch로 무시)
 */
@CapacitorPlugin(name = "NavigationBar")
public class NavigationBarPlugin extends Plugin {

    @PluginMethod
    public void setColor(PluginCall call) {
        String color = call.getString("color", "#000000");
        // darkIcons=true → 밝은 배경(라이트 테마)용 어두운 아이콘
        boolean darkIcons = Boolean.TRUE.equals(call.getBoolean("darkIcons", false));

        getActivity().runOnUiThread(() -> {
            try {
                Window window = getActivity().getWindow();
                window.setNavigationBarColor(Color.parseColor(color));
                WindowCompat.getInsetsController(window, window.getDecorView())
                        .setAppearanceLightNavigationBars(darkIcons);
                call.resolve();
            } catch (IllegalArgumentException e) {
                call.reject("Invalid color: " + color);
            }
        });
    }
}
