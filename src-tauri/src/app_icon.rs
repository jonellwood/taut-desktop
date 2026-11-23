//! Runtime accent icons only; installed bundle icons remain unchanged.
#[cfg(not(target_os="macos"))]
use tauri::Manager;
fn pixels(accent:&str)->Result<&'static [u8],String>{
 Ok(match accent {
  "amber"=>include_bytes!("../icons/accents/amber.rgba"),
  "teal"=>include_bytes!("../icons/accents/teal.rgba"),
  "violet"=>include_bytes!("../icons/accents/violet.rgba"),
  "blue"=>include_bytes!("../icons/accents/blue.rgba"),
  "rose"=>include_bytes!("../icons/accents/rose.rgba"),
  _=>return Err("Unknown accent".into()),
 })
}
#[tauri::command]
pub fn app_icon_accent(app:tauri::AppHandle,accent:String)->Result<(),String>{
 let rgba=pixels(&accent)?;
 #[cfg(target_os="macos")]
 {
  // macOS ignores window icons; update the running application's Dock icon.
  let png:&'static [u8]=match accent.as_str(){
   "amber"=>include_bytes!("../../public/icons/amber.png"),"teal"=>include_bytes!("../../public/icons/teal.png"),"violet"=>include_bytes!("../../public/icons/violet.png"),"blue"=>include_bytes!("../../public/icons/blue.png"),_=>include_bytes!("../../public/icons/rose.png")};
  app.run_on_main_thread(move||{
   use objc2::{AllocAnyThread,MainThreadMarker};
   use objc2_app_kit::{NSApplication,NSImage};
   use objc2_foundation::NSData;
   if let Some(mtm)=MainThreadMarker::new(){
    let data=NSData::with_bytes(png);
    if let Some(icon)=NSImage::initWithData(NSImage::alloc(),&data){unsafe{NSApplication::sharedApplication(mtm).setApplicationIconImage(Some(&icon));}}
   }
  }).map_err(|e|e.to_string())?;
 }
 #[cfg(not(target_os="macos"))]
 if let Some(window)=app.get_webview_window("main"){window.set_icon(tauri::image::Image::new_owned(rgba.to_vec(),256,256)).map_err(|e|e.to_string())?;}
 let _=rgba;
 Ok(())
}
