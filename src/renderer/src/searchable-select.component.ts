import { ChangeDetectionStrategy, Component, ElementRef, HostListener, ViewChild, computed, inject, Input, Output, EventEmitter, signal } from '@angular/core';

export interface SelectChoice { value: string; label: string; detail?: string; pinned?: boolean; }

/** A selection surface: the query is never rendered outside the open popover. */
@Component({
  selector: 'rift-searchable-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button #trigger type="button" class="branch-trigger" [disabled]="disabled()"
      [attr.aria-label]="label()" aria-haspopup="listbox" [attr.aria-expanded]="open()"
      [attr.aria-controls]="open() ? id() + '-list' : null" [title]="selectedLabel()"
      (click)="toggle()" (keydown.arrowdown)="openFromKey($event)" (keydown.arrowup)="openFromKey($event)">
      @if (prefix()) { <small>{{ prefix() }}</small> }
      <span>{{ selectedLabel() }}</span><span aria-hidden="true">⌄</span>
    </button>
    @if (open()) {
      <div class="branch-popover">
        <div class="branch-query">
          <input #search type="text" role="combobox" maxlength="200" [attr.aria-label]="searchLabel()"
            aria-autocomplete="list" aria-expanded="true" [attr.aria-controls]="id() + '-list'"
            [attr.aria-activedescendant]="activeId()" (keydown)="onKey($event)"
            [value]="query()" (input)="searchFor($any($event.target).value)" placeholder="Search…">
          @if (query()) { <button type="button" aria-label="Clear search" (click)="clear()">×</button> }
        </div>
        @if (query() && matches().length === 0) { <p class="branch-no-results" role="status">No matching {{ prefix() ? 'target branches' : 'comparisons' }}</p> }
        <div class="branch-options" role="listbox" [id]="id() + '-list'" [attr.aria-label]="label()">
          @for (option of visibleOptions(); track option.value; let index = $index) {
            <div role="option" [id]="id() + '-option-' + index" [class.keyboard-active]="activeIndex() === index"
              [attr.aria-selected]="option.value === value()" [title]="option.label" (mousedown)="$event.preventDefault()" (click)="choose(option)">
              <span>{{ option.label }}</span>@if (option.detail) { <small>{{ option.detail }}</small> }
            </div>
          }
        </div>
      </div>
    }
  `
})
export class SearchableSelectComponent {
  readonly id = signal<string>('');
  @Input('id') set idInput(value: string) { this.id.set(value); }
  readonly label = signal<string>('');
  @Input('label') set labelInput(value: string) { this.label.set(value); }
  readonly searchLabel = signal<string>('');
  @Input('searchLabel') set searchLabelInput(value: string) { this.searchLabel.set(value); }
  readonly prefix = signal<string>('');
  @Input('prefix') set prefixInput(value: string) { this.prefix.set(value); }
  readonly options = signal<readonly SelectChoice[]>([]);
  @Input('options') set optionsInput(value: readonly SelectChoice[]) { this.options.set(value); }
  readonly value = signal<string | null>(null);
  @Input('value') set valueInput(value: string | null) { this.value.set(value); }
  readonly disabled = signal<boolean>(false);
  @Input('disabled') set disabledInput(value: boolean) { this.disabled.set(value); }
  @Output() readonly valueChange = new EventEmitter<string>();
  readonly open = signal(false);
  readonly query = signal('');
  readonly matches = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.options().filter(option => `${option.label} ${option.detail ?? ''}`.toLowerCase().includes(query));
  });
  readonly visibleOptions = computed(() => this.options().filter(option => option.value === this.value() || option.pinned || this.matches().includes(option)));
  readonly activeIndex = signal(0);
  readonly activeId = computed(() => this.visibleOptions()[this.activeIndex()] ? `${this.id()}-option-${this.activeIndex()}` : null);
  searchFor(query: string): void { this.query.set(query); this.activeIndex.set(0); }
  clear(): void { this.searchFor(''); this.host.nativeElement.querySelector('input')?.focus(); }
  choose(option: SelectChoice): void {
    if (this.disabled()) return;
    this.close(true);
    if (option.value !== this.value()) this.valueChange.emit(option.value);
  }
  close(restoreFocus = false): void {
    this.open.set(false); this.searchFor('');
    if (restoreFocus) this.trigger?.nativeElement.focus();
  }
  openFromKey(event: Event): void { event.preventDefault(); if (!this.open()) this.toggle(); }
  onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(true); return; }
    if (event.key === 'Tab') { this.close(); return; }
    const count = this.visibleOptions().length;
    if (event.key === 'Enter') {
      event.preventDefault(); const choice = this.visibleOptions()[this.activeIndex()]; if (choice) this.choose(choice); return;
    }
    if (!count || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    this.activeIndex.set(event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : (this.activeIndex() + (event.key === 'ArrowDown' ? 1 : -1) + count) % count);
    requestAnimationFrame(() => this.host.nativeElement.querySelector('[id="' + this.activeId() + '"]')?.scrollIntoView({block: 'nearest'}));
  }
  @HostListener('focusout', ['$event']) onFocusOut(event: FocusEvent): void {
    if (!this.host.nativeElement.contains(event.relatedTarget as Node)) this.close();
  }


  readonly selectedLabel = computed(() => this.options().find(option => option.value === this.value())?.label ?? 'Select target');
  @ViewChild('trigger') trigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('search') set search(element: ElementRef<HTMLInputElement> | undefined) { element?.nativeElement.focus(); }
  private readonly host = inject(ElementRef<HTMLElement>);
  toggle(): void { if (this.disabled()) return; if (this.open()) this.close(); else { this.searchFor(''); this.open.set(true); } }
  @HostListener('document:pointerdown', ['$event']) outside(event: PointerEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.close();
  }
}
