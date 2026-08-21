package app.mewly.client;

import android.graphics.Color;
import android.view.View;
import android.view.Window;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
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

    /**
     * 시스템 바 인셋(dp)을 반환한다. 엣지 투 엣지에서 상단 바·하단 제스처
     * 영역의 안전 여백을 웹 레이어가 CSS 변수로 반영하는 데 쓴다
     * (Android WebView는 env(safe-area-inset-*)를 채우지 않는다).
     */
    @PluginMethod
    public void getInsets(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            View decor = getActivity().getWindow().getDecorView();
            androidx.core.view.WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(decor);
            float density = getActivity().getResources().getDisplayMetrics().density;
            JSObject ret = new JSObject();
            if (insets != null) {
                Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
                ret.put("top", Math.round(bars.top / density));
                ret.put("bottom", Math.round(bars.bottom / density));
            } else {
                ret.put("top", 0);
                ret.put("bottom", 0);
            }
            call.resolve(ret);
        });
    }

    /**
     * 전체화면(영상 확대) 몰입 모드: 상태바·내비바를 함께 숨긴다.
     * 스와이프 시 일시 표시(BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE) — Android 표준.
     * JS 측 호출: src/native/init.js의 setStatusBarHidden().
     */
    @PluginMethod
    public void setBarsHidden(PluginCall call) {
        boolean hidden = Boolean.TRUE.equals(call.getBoolean("hidden", false));
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(window, window.getDecorView());
            if (hidden) {
                controller.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsetsCompat.Type.systemBars());
            } else {
                controller.show(WindowInsetsCompat.Type.systemBars());
            }
            call.resolve();
        });
    }

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
