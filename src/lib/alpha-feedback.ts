export function alphaFeedbackUrl(version:string){
 const url=new URL('https://github.com/jonellwood/taut-desktop/issues/new');
 url.searchParams.set('title','[Alpha feedback] ');
 url.searchParams.set('body',`App version: ${version}\nWindows/macOS version and device architecture: \n\nType: Bug / Suggestion / Question\n\nWhat were you trying to do?\n\nWhat happened?\n\nWhat did you expect?\n\nSteps to reproduce:\n1. \n\nScreenshots (optional; remove private information):\n`);
 return url.href;
}
