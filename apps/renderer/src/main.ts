import { bootstrapApplication } from '@angular/platform-browser';
import { provideZonelessChangeDetection } from '@angular/core';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection()],
}).catch((err: unknown) => {
  // renderer-level boundary — never let a bootstrap error pass silently
  document.body.setAttribute('data-bootstrap-error', String(err));
});
