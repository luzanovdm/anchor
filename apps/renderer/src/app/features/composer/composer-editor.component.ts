import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { EditorState } from '@codemirror/state';
import {
  EditorView,
  keymap,
  drawSelection,
  highlightActiveLine,
  placeholder,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';

/**
 * Thin CodeMirror 6 host. The editor is a view onto the draft body; every doc
 * change is emitted upward so the store can drive the durable autosave. The
 * component never persists — it only reflects and reports.
 */
@Component({
  selector: 'ac-composer-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="host" #host (drop)="onDrop($event)" (dragover)="onDragOver($event)"></div>`,
  styles: [
    `
      :host,
      .host {
        display: block;
      }
      .host :global(.cm-editor) {
        font-family: var(--tt-font-mono);
        font-size: var(--tt-text-sm);
        background: transparent;
        color: var(--tt-text-primary);
      }
      /* multi-line input: grows with content between a floor and a cap */
      .host :global(.cm-scroller) {
        min-height: 72px;
        max-height: 240px;
        overflow-y: auto;
        line-height: 1.55;
      }
      .host :global(.cm-editor.cm-focused) {
        outline: none;
      }
      .host :global(.cm-content) {
        padding: var(--tt-space-3) var(--tt-space-4);
        caret-color: var(--tt-accent);
      }
      .host :global(.cm-activeLine) {
        background: transparent;
      }
      .host :global(.cm-selectionBackground) {
        background: var(--tt-accent-subtle) !important;
      }
      .host :global(.cm-placeholder) {
        color: var(--tt-text-tertiary);
      }
    `,
  ],
})
export class ComposerEditorComponent {
  private readonly hostRef = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private readonly destroyRef = inject(DestroyRef);
  private view: EditorView | null = null;

  readonly initialDoc = input<string>('');
  readonly docChange = output<string>();
  readonly fileDropped = output<File>();
  readonly submit = output<void>();

  constructor() {
    afterNextRender(() => this.mount());
    this.destroyRef.onDestroy(() => this.view?.destroy());
  }

  /** Replace the whole document (used when switching drafts). */
  setDoc(text: string): void {
    const view = this.view;
    if (view === null) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  }

  /** Insert markdown at the current cursor (image/file reference after import). */
  insertAtCursor(text: string): void {
    const view = this.view;
    if (view === null) return;
    const pos = view.state.selection.main.head;
    view.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length } });
    view.focus();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (files === undefined) return;
    for (const file of Array.from(files)) this.fileDropped.emit(file);
  }

  private mount(): void {
    const state = EditorState.create({
      doc: this.initialDoc(),
      extensions: [
        history(),
        drawSelection(),
        highlightActiveLine(),
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              this.submit.emit();
              return true;
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        markdown(),
        placeholder('Write a message…  ⌘↩ to send'),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) this.docChange.emit(update.state.doc.toString());
        }),
      ],
    });
    this.view = new EditorView({ state, parent: this.hostRef().nativeElement });
  }
}
