import { Directive, ElementRef, AfterViewInit, OnDestroy } from "@angular/core";

@Directive({})
export class AriaDisabledTrapDirective implements AfterViewInit, OnDestroy {
  private clickHandler = (event: MouseEvent | KeyboardEvent) => {
    const btn = this.el.nativeElement as HTMLElement;
    if (btn.getAttribute("aria-disabled") === "true") {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  };

  constructor(private el: ElementRef<HTMLElement>) {}

  ngAfterViewInit() {
    this.el.nativeElement.addEventListener("click", this.clickHandler, true);
  }

  ngOnDestroy() {
    this.el.nativeElement.removeEventListener("click", this.clickHandler, true);
  }
}
