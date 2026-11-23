"""Blender 안에서 MCP for Blender 소켓 서버(9876)를 켠다.

클라우드처럼 화면이 없는 곳에서는 가상 화면으로 띄운다:
    xvfb-run -a -s "-screen 0 1280x720x24" blender --python youtube/blender/start_mcp.py
PC에서는 Blender를 그냥 열고 사이드바 > MCP for Blender > Connect to Claude 를 누르면 된다.
"""
import addon_utils
import bpy

addon_utils.enable("blender_mcp", default_set=True, persistent=True)
try:
    # 사용 기록(프롬프트·코드·스크린샷) 수집 동의는 끈다 (기본값도 꺼짐)
    bpy.context.preferences.addons["blender_mcp"].preferences.telemetry_consent = False
except Exception as exc:  # 애드온 버전에 따라 없을 수 있다
    print("telemetry pref not found:", exc)


def _start():
    try:
        win = bpy.context.window_manager.windows[0]
        with bpy.context.temp_override(window=win):
            bpy.ops.blendermcp.start_server()
        print("BlenderMCP server started")
    except Exception as exc:
        print("BlenderMCP start failed:", exc)
    return None


bpy.app.timers.register(_start, first_interval=1.0)
