import { Template } from "/scripts/core/utils/Template.js";
var Tpl = new Template();

class ModalElement {
	constructor(id) {
		this.id = id;
		this.overlay = true;
		this.title = "";
		this.content = "";
		this.style = "";
	}

	async show(template = "view/modal.html") {
		const modal = document.getElementById(`modal-${this.id}`);
		if (modal && modal.style.display !== "none") {
			this.close();
			return;
		}

		await this.getContent(template);

		const modalButtons = document.querySelectorAll(`#modal-${this.id} .modal-ok`);

		for (let i = 0; i < modalButtons.length; i++) {
			modalButtons[i].addEventListener("click", () => {
				const modelMgr = new ModalMgr();
				modelMgr.closeModal(this.id);
			});
		}
	}

	async getContent(template = "view/modal.html") {
		const prom = await Tpl.loadFile(template);
		Tpl.setIf("overlay", this.overlay);
		Tpl.setVar("title", this.title);
		Tpl.setVar("id", this.id);
		Tpl.setVar("content", this.content);
		Tpl.setVar("style", this.style);
		const content = Tpl.render(prom);
		document.body.insertAdjacentHTML("beforeend", content);
	}

	close() {
		const body = document.querySelector("body");
		const modal = document.getElementById(`modal-${this.id}`);
		const overlay = document.getElementById(`overlay-${this.id}`);

		if (modal && overlay) {
			body.removeChild(modal);
			body.removeChild(overlay);
		}

		//remove eventlisteners
		this.removeEventListeners();
	}

	removeEventListeners() {
		const modalButtons = document.querySelectorAll(`#modal-${this.id} .modal-ok`);
		for (let i = 0; i < modalButtons.length; i++) {
			modalButtons[i].removeEventListener("click", this.close);
		}
	}
}

class ModalMgr {
	static #instance = null;

	constructor() {
		if (ModalMgr.#instance) {
			// Return the existing instance if it already exists
			return ModalMgr.#instance;
		}
		// Initialize the instance if it doesn't exist
		ModalMgr.#instance = this;

		this.arrModal = [];

		window.addEventListener("keydown", this.closeOnKey);
	}

	newModal(id) {
		const m = new ModalElement(id);
		this.arrModal.push(m);
		return m;
	}

	closeModal(id) {
		const m = this.arrModal.find((m) => m.id === id);
		if (m) {
			m.close();
		}

		// Remove the modal from the array
		this.arrModal = this.arrModal.filter((m) => m.id !== id);
	}

	closeOnKey = (event) => {
		if (["Escape", " ", "Enter"].includes(event.key)) {
			const m = this.arrModal.pop();
			if (m) {
				m.close();
			}
		}
	};
}

export { ModalMgr };
