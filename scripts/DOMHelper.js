function isPageLogin(doc) {
	const loginForm = doc.querySelector("body #authportal-main-section");
	if (loginForm) {
		return true;
	}
	const loginForm2 = doc.querySelector("body form.auth-validate-form");
	if (loginForm2) {
		if (loginForm2.name === "signIn") {
			return true;
		}
	}
	return false;
}

function isPageCaptcha(doc) {
	const captchaForm = doc.querySelector("body .a-section form");
	if (captchaForm) {
		const captcha = captchaForm.action.split("/")[4];
		if (captcha === "validateCaptcha") {
			return true;
		}
	}
	return false;
}
function isPageDog(doc) {
	const dogImg = doc.querySelector("body img#d");
	if (dogImg) {
		const dog = dogImg.alt;
		if (dog === "Dogs of Amazon / Chiens d'Amazon") {
			return true;
		}
	}
	return false;
}


export { isPageLogin, isPageCaptcha, isPageDog };
