import {test} from 'node:test';import assert from 'node:assert/strict';
import {safeMessageLink,codeLanguage,languageLabel,codeTokens} from '../src/lib/message-body.ts';
test('links allow only explicit credential-free web URLs',()=>{
 for(const value of ['javascript:alert(1)','data:text/html,hi','file:///etc/hosts','https://user:password@example.com','/relative','mailto:person@example.com'])assert.equal(safeMessageLink(value),null);
 assert.equal(safeMessageLink('https://example.com/path?q=hello'),'https://example.com/path?q=hello');
});
test('code language labels normalize Teams classes without inserting markup',()=>{
 assert.equal(codeLanguage('PowerShell'),'powershell');assert.equal(codeLanguage('language-ps1'),'powershell');
 assert.equal(codeLanguage('hljs language-pwsh'),'powershell');assert.equal(languageLabel('powershell'),'PowerShell');
 assert.equal(codeLanguage(''),'plaintext');assert.equal(codeLanguage('<svg/onload=bad>'),'plaintext');
 assert.equal(codeLanguage('unknownlang'),'unknownlang');
});
test('PowerShell highlighting reconstructs the exact code including tabs, blank lines and punctuation',()=>{
 const code='# Comment\n$Users = Get-MgUser -Filter "name eq \'test\'"\n\n\tforeach ($u in $Users) {\n  Write-Host $u\n}\n'.replaceAll('\\n','\n');
 const tokens=codeTokens(code,'powershell');assert.equal(tokens.map(t=>t.text).join(''),code);
 assert.ok(tokens.some(t=>t.style==='comment'));assert.ok(tokens.some(t=>t.style==='variable'));assert.ok(tokens.some(t=>t.style==='command'));
 for(const lang of ['unknownlang','plaintext','javascript'])assert.deepEqual(codeTokens(code,lang),[{text:code}]);
 assert.equal(codeTokens('a'.repeat(100001),'powershell').length,1);
});
test('unclosed escaped PowerShell strings are scanned once and preserve every character',()=>{
 const source='"'+String.fromCharCode(96,34).repeat(40000);
 const tokens=codeTokens(source,'powershell');
 assert.equal(tokens.map(t=>t.text).join(''),source);
 assert.equal(tokens.length,1);assert.equal(tokens[0].style,'string');
});
