//! Suggested Windows filenames only; the user explicitly chooses the destination.
pub fn suggested_name(value:&str)->String{
 let mut units=0;let filtered:String=value.chars().filter(|c|!c.is_control()&&!"<>:\"/\\|?*".contains(*c)).take_while(|c|{units+=c.len_utf16();units<=180}).collect();
 let name=filtered.trim_end_matches(['.',' ']);let stem=name.split('.').next().unwrap_or("").trim_end().to_ascii_uppercase();
 if name.is_empty(){return "attachment".into();}
 if matches!(stem.as_str(),"CON"|"PRN"|"AUX"|"NUL")||["COM","LPT"].iter().any(|p|stem.strip_prefix(p).is_some_and(|n|n.len()==1&&matches!(n.as_bytes()[0],b'1'..=b'9'))){format!("attachment-{name}")}else{name.into()}
}
#[cfg(test)]mod tests{use super::*;#[test]fn windows_suggestions_cannot_be_paths_or_device_names(){for (input,want) in [("../../report?.pdf","....report.pdf"),("CON.txt","attachment-CON.txt"),("lpt1","attachment-lpt1"),("hello. ","hello"),("\u{0}","attachment"),("notes.pdf","notes.pdf")]{assert_eq!(suggested_name(input),want);}}#[test]fn unicode_names_fit_windows_limits(){let n=suggested_name(&"😀".repeat(200));assert_eq!(n.encode_utf16().count(),180);}}
