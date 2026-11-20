//! Commit a flushed temporary file without weakening the away-reply ledger.
use std::path::Path;
#[cfg(unix)]
pub fn replace(source:&Path,destination:&Path)->std::io::Result<()>{
 std::fs::rename(source,destination)?;
 std::fs::File::open(destination.parent().ok_or_else(||std::io::Error::other("Missing destination directory"))?)?.sync_all()
}
#[cfg(target_os="windows")]
pub fn replace(source:&Path,destination:&Path)->std::io::Result<()>{
 use std::os::windows::ffi::OsStrExt;
 use windows_sys::Win32::Storage::FileSystem::{MoveFileExW,MOVEFILE_REPLACE_EXISTING,MOVEFILE_WRITE_THROUGH};
 let source:Vec<u16>=source.as_os_str().encode_wide().chain(Some(0)).collect();
 let destination:Vec<u16>=destination.as_os_str().encode_wide().chain(Some(0)).collect();
 if unsafe{MoveFileExW(source.as_ptr(),destination.as_ptr(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH)}==0{Err(std::io::Error::last_os_error())}else{Ok(())}
}
#[cfg(not(any(unix,target_os="windows")))]
pub fn replace(_: &Path,_:&Path)->std::io::Result<()>{Err(std::io::Error::other("Durable storage is unavailable"))}
#[cfg(test)]mod tests{use super::*;#[test]fn replaces_an_existing_ledger_without_leaving_a_temporary_file(){let root=std::env::temp_dir().join(format!("taut-durable-{}",crate::random_urlsafe()));std::fs::create_dir_all(&root).unwrap();let dest=root.join("ledger");for data in [b"first".as_slice(),b"second".as_slice()]{let temp=root.join("staged");let file=std::fs::File::create(&temp).unwrap();use std::io::Write;(&file).write_all(data).unwrap();file.sync_all().unwrap();drop(file);replace(&temp,&dest).unwrap();assert!(!temp.exists());assert_eq!(std::fs::read(&dest).unwrap(),data);}std::fs::remove_dir_all(root).unwrap();}}
