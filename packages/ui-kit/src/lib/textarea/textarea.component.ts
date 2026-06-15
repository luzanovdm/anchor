import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  model,
  viewChild,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';

@Component({
  selector: 'tt-textarea',
  templateUrl: './textarea.component.html',
  styleUrl: './textarea.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.tt-textarea-error]': 'error()',
    '[class.tt-textarea-fill]': 'fillHeight()',
  },
})
export class TextareaComponent implements FormValueControl<string> {
  public readonly label = input<string>('');
  public readonly placeholder = input<string>('');
  public readonly hint = input<string>('');
  public readonly error = input<string>('');
  public readonly textareaId = input<string>('');
  public readonly rows = input(4);
  /**
   * Stretch the textarea to fill its parent's available height. Host
   * becomes `flex: 1` and the textarea grows to consume remaining space.
   * Use inside panels where the note input is the primary surface
   * (quick-tx note panel, scratch notes).
   */
  public readonly fillHeight = input(false);
  public readonly autocomplete = input('');
  public readonly name = input('');
  public readonly minLength = input<number | undefined>(undefined);
  public readonly maxLength = input<number | undefined>(undefined);
  public readonly readonly = input(false);
  public readonly required = input(false);
  public readonly ariaLabel = input('');
  public readonly disabled = input(false);
  public readonly value = model('');
  public readonly touched = model(false);

  private readonly textareaElement = viewChild<ElementRef<HTMLTextAreaElement>>('textareaElement');

  public focus(options?: FocusOptions): void {
    this.textareaElement()?.nativeElement.focus(options);
  }

  protected onInput(event: Event): void {
    const target = event.target;
    const value = target instanceof HTMLTextAreaElement ? target.value : '';

    this.value.set(value);
  }

  protected markTouched(): void {
    this.touched.set(true);
  }
}
