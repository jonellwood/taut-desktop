//! Windows Credential Manager, current-user generic credentials. Never a file fallback.
use windows_sys::Win32::{Foundation::{GetLastError,ERROR_NOT_FOUND},Security::Credentials::{CredReadW,CredWriteW,CredDeleteW,CredFree,CREDENTIALW,CRED_TYPE_GENERIC,CRED_PERSIST_LOCAL_MACHINE,CRED_MAX_CREDENTIAL_BLOB_SIZE}};
fn wide(value:&str)->Vec<u16>{value.encode_utf16().chain(Some(0)).collect()}
struct Credential(*mut CREDENTIALW);
impl Drop for Credential{fn drop(&mut self){unsafe{CredFree(self.0.cast());}}}
pub fn load(target:&str)->Result<Option<String>,()>{
 let target=wide(target);let mut raw=std::ptr::null_mut();
 // CredReadW allocates one credential; the RAII owner frees it on every exit.
 if unsafe{CredReadW(target.as_ptr(),CRED_TYPE_GENERIC,0,&mut raw)}==0{return if unsafe{GetLastError()}==ERROR_NOT_FOUND{Ok(None)}else{Err(())};}
 if raw.is_null(){return Err(());}let owner=Credential(raw);let credential=unsafe{&*owner.0};let size=credential.CredentialBlobSize as usize;
 if size==0||size>CRED_MAX_CREDENTIAL_BLOB_SIZE as usize||credential.CredentialBlob.is_null(){return Err(());}
 let bytes=unsafe{std::slice::from_raw_parts(credential.CredentialBlob,size)};
 String::from_utf8(bytes.to_vec()).map(Some).map_err(|_|())
}
pub fn save(target:&str,refresh:&str)->Result<(),()>{
 // Generic credentials have a fixed OS blob limit. Oversized tokens leave the
 // existing secret untouched and surface the session-only storage warning.
 if refresh.is_empty()||refresh.len()>CRED_MAX_CREDENTIAL_BLOB_SIZE as usize{return Err(());}
 let target=wide(target);let user=wide("TAUT Microsoft 365");let mut bytes=refresh.as_bytes().to_vec();
 let credential=CREDENTIALW{Type:CRED_TYPE_GENERIC,TargetName:target.as_ptr().cast_mut(),CredentialBlobSize:bytes.len() as u32,CredentialBlob:bytes.as_mut_ptr(),Persist:CRED_PERSIST_LOCAL_MACHINE,UserName:user.as_ptr().cast_mut(),..unsafe{std::mem::zeroed()}};
 let result=unsafe{CredWriteW(&credential,0)};bytes.fill(0);
 if result==0{Err(())}else{Ok(())}
}
pub fn delete(target:&str)->Result<(),()>{let target=wide(target);if unsafe{CredDeleteW(target.as_ptr(),CRED_TYPE_GENERIC,0)}!=0||unsafe{GetLastError()}==ERROR_NOT_FOUND{Ok(())}else{Err(())}}
#[cfg(test)]mod tests{use super::*;#[test]fn invalid_secrets_fail_before_touching_credential_manager(){assert!(save("test-never-written","").is_err());assert!(save("test-never-written",&"x".repeat(CRED_MAX_CREDENTIAL_BLOB_SIZE as usize+1)).is_err());}}
