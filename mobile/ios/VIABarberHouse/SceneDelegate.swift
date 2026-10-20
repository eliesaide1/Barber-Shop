import UIKit
import React_RCTAppDelegate

/* iOS/iPadOS 27 refuses to launch an app built against its SDK that still uses
   the plain UIApplicationDelegate life cycle: the process is killed before any
   JavaScript runs, with "UIScene life cycle is required for apps built with
   this SDK". It is the SDK the binary links against that arms the check, not
   the deployment target — which is why the same build runs fine on a phone
   still on iOS 26 and died instantly on App Review's iPad on 27.0.

   Adopting UIScene is the whole fix. The app stays single-window; this scene
   is the only one it ever opens.

   The window has to be created *from* the scene. React Native's factory mounts
   into whatever window it is handed and makes it key, but a window built the
   old way — UIWindow(frame: UIScreen.main.bounds) — belongs to no scene, so it
   is never actually displayed: a black screen rather than a crash, which is the
   usual second mistake after the first one is fixed. */
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    /* The scene owns it; the app delegate only publishes it. See the note on
       AppDelegate.window for who reads it and what happens when nobody does. */
    appDelegate.window = window

    /* The launch options the app delegate was handed. A push that cold-started
       the app arrives in here, and dropping it would lose the notification that
       caused the launch in the first place. */
    factory.startReactNative(
      withModuleName: AppDelegate.moduleName,
      in: window,
      launchOptions: appDelegate.launchOptions
    )
  }
}
