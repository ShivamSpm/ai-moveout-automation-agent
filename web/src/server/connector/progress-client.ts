// Browser-only entry, bundled inline. No API calls, credentials or external scripts.
import { App } from '@modelcontextprotocol/ext-apps';
const app = new App({ name: 'Vacate progress', version: '0.2.0' });
app.ontoolresult = () => {}; // HTML already contains the authenticated snapshot.
app.connect().then(() => {
  document.querySelectorAll<HTMLAnchorElement>('a').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      void app.openLink({ url: link.href });
    });
  });
}).catch(() => { /* Static snapshot and ordinary links remain usable. */ });
