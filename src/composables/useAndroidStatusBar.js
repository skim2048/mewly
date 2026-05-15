import { Capacitor } from '@capacitor/core'

export async function setAndroidStatusBarColor(color) {
  if (typeof window === 'undefined' || Capacitor.getPlatform() !== 'android') return
  const { StatusBar } = await import('@capacitor/status-bar')
  await StatusBar.setOverlaysWebView({ overlay: false })
  await StatusBar.setBackgroundColor({ color })
}
