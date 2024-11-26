class Internationalization {
	#domainTLD;
	#countryCode;
	#locale;
	#currency;

	constructor() {
		if (typeof window !== "undefined") {
			const currentUrl = window.location.href;
			const regex = /^.+?amazon\.([a-z.]+).*\/vine\/.*$/;
			const arrMatches = currentUrl.match(regex);
			if (arrMatches != null) {
				const domainTLD = arrMatches[1];
				this.setDomainTLD(domainTLD);
			}
		}
	}

	setDomainTLD(domainTLD) {
		const vineLocales = this.#getLocales();

		this.#domainTLD = domainTLD;
		this.#countryCode = this.#domainTLD.split(".").pop();
		this.#locale = vineLocales[this.#countryCode].locale;
		this.#currency = vineLocales[this.#countryCode].currency;
	}

	setCountryCode(countryCode) {
		const vineLocales = this.#getLocales();
		this.#domainTLD = vineLocales[countryCode].domain;
		this.#countryCode = countryCode;
		this.#locale = vineLocales[this.#countryCode].locale;
		this.#currency = vineLocales[this.#countryCode].currency;
	}

	#getLocales() {
		return {
			ca: { locale: "en-CA", currency: "CAD", domain: "ca" },
			com: { locale: "en-US", currency: "USD", domain: "com" },
			uk: { locale: "en-GB", currency: "GBP", domain: "co.uk" },
			jp: { locale: "ja-JP", currency: "JPY", domain: "co.jp" },
			de: { locale: "de-DE", currency: "EUR", domain: "de" },
			fr: { locale: "fr-FR", currency: "EUR", domain: "fr" },
			es: { locale: "es-ES", currency: "EUR", domain: "es" },
			it: { locale: "it-IT", currency: "EUR", domain: "it" },
			au: { locale: "en-AU", currency: "AUD", domain: "com.au" },
		};
	}

	getDomainTLD() {
		return this.#domainTLD;
	}

	getCountryCode() {
		return this.#countryCode;
	}

	getLocale() {
		return this.#locale;
	}

	getCurrency() {
		return this.#currency;
	}
}

export { Internationalization };
