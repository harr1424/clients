import { Directive } from "@angular/core";

@Directive({
	host: {
		"[attr.bit-aria-disable]": 'true',
	}
})
export class AriaDisableDirective {}