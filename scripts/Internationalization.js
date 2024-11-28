class Internationalization {
	#domainTLD;
	#countryCode;
	#locale;
	#currency;

	constructor() {
		//Try to set the locale if the context allows for it.
		//ie.: extensions pages won't work.
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
		if (!this.#doesDomainTLDExist(domainTLD)) {
			throw Error(domainTLD + " is not a valid/supported domainTLD.");
		}

		const vineLocales = this.#getLocales();
		this.#domainTLD = domainTLD;
		this.#countryCode = this.#domainTLD.split(".").pop(); /*Works for now, but potential for conflict
																would be better to query the getLocales() table and get the internal abbreviation.
																*/
		this.#locale = vineLocales[this.#countryCode].locale;
		this.#currency = vineLocales[this.#countryCode].currency;
	}

	setCountryCode(countryCode) {
		if (!this.#doesCountryCodeExist(countryCode)) {
			throw Error(countryCode + " is not a valid/supported country code.");
		}

		const vineLocales = this.#getLocales();
		this.#domainTLD = vineLocales[countryCode].domain;
		this.#countryCode = countryCode;
		this.#locale = vineLocales[this.#countryCode].locale;
		this.#currency = vineLocales[this.#countryCode].currency;
	}

	#doesCountryCodeExist(countryCode) {
		const locales = this.#getLocales();
		return locales.hasOwnProperty(countryCode);
	}
	#doesDomainTLDExist(domainTLD) {
		const locales = this.#getLocales();
		// Iterate through the locales and check if any of the domain properties match domainTLD
		return Object.values(locales).some((locale) => locale.domain === domainTLD);
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
			br: { locale: "pt-BR", currency: "BRL", domain: "com.br" },
			mx: { locale: "es-MX", currency: "MXN", domain: "com.mx" },
			sg: { locale: "en-SG", currency: "SGD", domain: "sg" },
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
