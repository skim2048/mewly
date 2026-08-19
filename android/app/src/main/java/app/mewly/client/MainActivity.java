package app.mewly.client;

import android.graphics.Bitmap;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 커스텀 플러그인은 super.onCreate 전에 등록해야 한다 (Capacitor 규칙)
        registerPlugin(NavigationBarPlugin.class);
        super.onCreate(savedInstanceState);

        // @claude Android WebView는 poster 없는 <video>에 내장 기본 포스터(회색 배경
        // @claude + 검은 재생 버튼 그래픽)를 그린다 — 데스크톱 Chrome에는 없는 동작이라
        // @claude 웹 개발 중엔 안 보인다. 투명 1×1 비트맵으로 바꿔 앱 전체에서 제거한다.
        // @claude (라이브 뷰·기록 탭 섬네일·클립 플레이어 모두 해당)
        getBridge()
            .getWebView()
            .setWebChromeClient(
                new BridgeWebChromeClient(getBridge()) {
                    @Override
                    public Bitmap getDefaultVideoPoster() {
                        return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
                    }
                }
            );
    }
}
